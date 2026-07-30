// Vivas webhook for bordbestillingen. Aktiv når PAYMENT_PROVIDER=viva.
//
// Vigtige forudsætninger:
//  - Viva SIGNERER IKKE sine webhooks. Payloaden må derfor ALDRIG bruges som
//    kilde til beløb eller status — vi henter altid transaktionen hos Viva og
//    bruger kun det svar.
//  - Adgang beskyttes med en delt hemmelighed i URL'en (?k=), som skal matche
//    VIVA_WEBHOOK_TOKEN (timing-safe). Ukendt/manglende → 404.
//  - Vivas orderCode er 16 cifre og læses som streng ud af rå tekst (aldrig som
//    JavaScript-tal, der ville miste præcision).
//  - Fail-closed: er noget uafklaret, ændres ordren ikke.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getDb } from "@/lib/db";
import {
  markOrderFailedByRef,
  markOrderPaidByRef,
  markOrderRefundedByRef,
} from "@/lib/orders";
import { getConfiguredProviderName } from "@/lib/payments";
import { vivaProvider } from "@/lib/payments/viva";
import { getVivaWebhookKey, extractOrderCode } from "@/lib/payments/viva-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vivas event-typer vi reagerer på.
const EVENT_PAYMENT_FAILED = 1798;
const EVENT_TRANSACTION_REVERSAL = 1797;

/** Timing-safe sammenligning af to strenge (undgår at lække via svartid). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Delt hemmelighed i ?k= skal matche VIVA_WEBHOOK_TOKEN. Ellers 404. */
function keyValid(req: NextRequest): boolean {
  const provided = req.nextUrl.searchParams.get("k") ?? "";
  const expected = process.env.VIVA_WEBHOOK_TOKEN ?? "";
  if (!expected) return false;
  return safeEqual(provided, expected);
}

/**
 * GET — Vivas verifikations-handshake. Viva forventer { "Key": "<nøglen>" }.
 * Vi henter nøglen hos Viva med Basic auth og svarer med den.
 */
export async function GET(req: NextRequest) {
  if (!keyValid(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const key = await getVivaWebhookKey();
    return NextResponse.json({ Key: key });
  } catch (err) {
    console.error("Viva-webhook: kunne ikke hente verifikationsnøgle");
    return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
  }
}

/** POST — et Viva-event. */
export async function POST(req: NextRequest) {
  if (!keyValid(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Denne webhook er kun aktiv, når Viva er den valgte udbyder.
  if (getConfiguredProviderName() !== "viva") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const raw = await req.text();
  let parsed: {
    EventTypeId?: number;
    EventData?: { TransactionId?: string };
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformet payload: intet at gøre.
    return NextResponse.json({ received: true });
  }

  const eventTypeId = Number(parsed?.EventTypeId);
  const transactionId = parsed?.EventData?.TransactionId;
  // orderCode læses som streng ud af rå tekst (16 cifre — for stort til number).
  const orderCode = extractOrderCode(raw);

  // Mangler transaktion eller orderCode: kvittér 200 uden at gøre noget.
  if (!transactionId || typeof transactionId !== "string" || !orderCode) {
    return NextResponse.json({ received: true });
  }

  try {
    // Hent ALTID transaktionen hos Viva og brug kun det svar (payloaden er
    // usigneret). verifyPayment kaster, hvis den hentede orderCode ikke matcher
    // payloadens forventede orderCode.
    const verified = await vivaProvider.verifyPayment({
      paymentRef: orderCode,
      transactionId,
    });
    // Ukendt transaktion (404) → ingen ændring (fail-closed).
    if (!verified) {
      return NextResponse.json({ received: true });
    }

    const db = getDb();

    if (eventTypeId === EVENT_TRANSACTION_REVERSAL) {
      // Refundering/reversal.
      await markOrderRefundedByRef(db, "viva", verified.paymentRef);
    } else if (verified.status === "paid") {
      const result = await markOrderPaidByRef(db, {
        provider: "viva",
        paymentRef: verified.paymentRef,
        transactionId: verified.transactionId,
        amountTotalOre: verified.amountOre,
        currency: verified.currency,
      });
      if (result.status === "amount_mismatch") {
        // Beløb matcher ikke kladden: log som fejl, men ændr IKKE ordren.
        console.error("Viva-webhook: beløb matcher ikke ordrekladden", {
          orderId: result.orderId,
        });
      }
    } else if (eventTypeId === EVENT_PAYMENT_FAILED) {
      // Vi er her kun, når status ikke er "paid" (håndteret ovenfor).
      await markOrderFailedByRef(db, "viva", verified.paymentRef);
    }
    // Alt andet: 200, ingen ændring.

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Viva-webhook: fejl under håndtering");
    // 500 → Viva prøver igen; håndteringen er idempotent.
    return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
  }
}
