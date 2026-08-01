// Vivas FÆLLES webhook for hele sitet. Aktiv når PAYMENT_PROVIDER=viva.
//
// Viva sender alle transaktioner på kontoen til det samme endpoint, så vi
// dirigerer ud fra transaktionens første tag: "billet" / "genbestil" /
// "bordbestilling".
//
// Vigtige forudsætninger:
//  - Viva SIGNERER IKKE sine webhooks. Payloaden må derfor ALDRIG bruges som
//    kilde til beløb, status eller reference — vi henter altid transaktionen hos
//    Viva og bruger kun det svar (inkl. tags).
//  - Adgang beskyttes med en delt hemmelighed i URL'en (?k=), som skal matche
//    VIVA_WEBHOOK_TOKEN (timing-safe). Ukendt/manglende → 404.
//  - Vivas orderCode er 16 cifre og læses som streng (aldrig som JavaScript-tal).
//  - Fail-closed: er noget uafklaret, ændres intet.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getDb } from "@/lib/db";
import {
  markOrderFailedByRef,
  markOrderPaidByRef,
  markOrderRefundedByRef,
} from "@/lib/orders";
import {
  getTicketPayment,
  markTicketFailedByRef,
  markTicketPaidByRef,
  markTicketRefundedByRef,
  revertTicketPaidByRef,
  type TicketPaymentRow,
} from "@/lib/ticket-payments";
import { getConfiguredProviderName } from "@/lib/payments";
import { verifiedFromTransaction } from "@/lib/payments/viva";
import {
  getVivaWebhookKey,
  extractOrderCode,
  retrieveVivaTransaction,
} from "@/lib/payments/viva-client";
import { getRecord, updateRecord, TABLES, FIELDS } from "@/lib/airtable";
import { addonBreakdown, mergeAddonBreakdowns, buildBookingView } from "@/lib/genbestil";
import { ticketEmailHtml, daDateShort, showYear } from "@/lib/ticket-email";
import { orderEmailHtml } from "@/lib/order-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import { sendMail } from "@/lib/resend";

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
  let parsed: { EventTypeId?: number; EventData?: { TransactionId?: string } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: true });
  }

  const eventTypeId = Number(parsed?.EventTypeId);
  const transactionId = parsed?.EventData?.TransactionId;
  const orderCode = extractOrderCode(raw);

  // Mangler transaktion eller orderCode: kvittér 200 uden at gøre noget.
  if (!transactionId || typeof transactionId !== "string" || !orderCode) {
    return NextResponse.json({ received: true });
  }

  try {
    // Hent ALTID transaktionen hos Viva og brug kun det svar (usigneret payload).
    const txn = await retrieveVivaTransaction(transactionId);
    if (!txn) {
      return NextResponse.json({ received: true }); // ukendt transaktion
    }

    const db = getDb();
    const verified = verifiedFromTransaction(txn);

    // Dirigering på VORES EGEN reference — ikke på tags. Viva returnerer ikke
    // pålideligt de tags, vi satte på ordren, tilbage på den hentede transaktion
    // (demo giver fx en tom liste), så tags kan ikke bruges til at afgøre flowet.
    // Findes orderCode i billet-ledgeren, er det et billet/genbestil-flow (rækken
    // kender selv hvilket via ticket.flow); ellers behandles det som en
    // bordbestilling. Begge veje er fail-closed: en ukendt reference giver
    // "not_found" og ingen tilstandsændring.
    const ticket = await getTicketPayment(db, verified.paymentRef);

    if (!ticket) {
      // Bordbestilling (eller en reference vi ikke kender → ingen ændring).
      if (eventTypeId === EVENT_TRANSACTION_REVERSAL) {
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
          console.error("Viva-webhook: beløb matcher ikke ordrekladden", {
            orderId: result.orderId,
          });
        }
      } else if (eventTypeId === EVENT_PAYMENT_FAILED) {
        await markOrderFailedByRef(db, "viva", verified.paymentRef);
      }
      return NextResponse.json({ received: true });
    }

    // Billet/genbestil (ticket.flow er det præcise flow; fulfill håndterer begge).
    if (eventTypeId === EVENT_TRANSACTION_REVERSAL) {
      await markTicketRefundedByRef(db, verified.paymentRef);
      return NextResponse.json({ received: true });
    }

    if (verified.status === "paid") {
      const result = await markTicketPaidByRef(db, {
        paymentRef: verified.paymentRef,
        amountOre: verified.amountOre,
        currency: verified.currency,
      });
      if (result.status === "amount_mismatch") {
        console.error("Viva-webhook: beløb matcher ikke booking-total", {
          bookingNo: result.payment.bookingNo,
        });
        return NextResponse.json({ received: true }); // ingen ændring
      }
      if (result.status !== "paid") {
        // not_found (ukendt ref) eller already_paid (idempotent) → ingen mail.
        console.warn("Viva-webhook: ingen handling — billet ikke markeret", {
          reason: result.status,
          paymentRef: verified.paymentRef,
        });
        return NextResponse.json({ received: true });
      }
      // Kun vinderen af pending → paid når hertil (præcis én gang). Fejler en
      // sideeffekt, frigives overgangen igen, så Vivas genforsøg kan prøve på ny.
      try {
        await fulfillTicketPayment(result.payment);
      } catch (err) {
        await revertTicketPaidByRef(db, verified.paymentRef);
        console.error("Viva-webhook: kunne ikke fuldføre billetbetaling");
        return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }

    if (eventTypeId === EVENT_PAYMENT_FAILED) {
      await markTicketFailedByRef(db, verified.paymentRef);
      return NextResponse.json({ received: true });
    }
    // Hverken betalt, refunderet eller fejlet — fx en status vi ikke reagerer
    // på. Logges, så tavse "gør intet"-tilfælde kan diagnosticeres.
    console.warn("Viva-webhook: ingen handling — uventet status", {
      flow: ticket.flow,
      mappedStatus: verified.status,
      eventTypeId,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Viva-webhook: fejl under håndtering");
    // 500 → Viva prøver igen; håndteringen er idempotent.
    return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
  }
}

/**
 * Opdaterer Airtable og sender bekræftelsesmail for en betalt billet- eller
 * genbestilling. Kaldes KUN af den kalder, der vandt pending → paid-overgangen.
 * Kaster ved fejl, så kalderen kan frigive overgangen igen.
 */
async function fulfillTicketPayment(payment: TicketPaymentRow): Promise<void> {
  const paidKr = Math.round(payment.expectedTotalOre / 100);
  const discountKr = Math.round(payment.discountOre / 100);

  if (payment.flow === "genbestil") {
    // Læg tilvalgene oven i den eksisterende booking; opret ingen ny.
    const existing = await getRecord(TABLES.bookings, payment.bookingId);
    const prevDiscount = Number(existing.fields[FIELDS.booking.discount] ?? 0);
    const prevPaid = Number(existing.fields[FIELDS.booking.totalPaid] ?? 0);
    const prevAddons = String(existing.fields[FIELDS.booking.addons] ?? "");
    const newAddons = addonBreakdown(
      payment.lineItems.map((li) => ({ name: li.description, quantity: li.quantity }))
    );
    const grandTotalKr = prevPaid + paidKr;
    await updateRecord(TABLES.bookings, payment.bookingId, {
      [FIELDS.booking.addons]: mergeAddonBreakdowns(prevAddons, newAddons),
      [FIELDS.booking.discount]: prevDiscount + discountKr,
      [FIELDS.booking.totalPaid]: grandTotalKr,
    });
    if (payment.customerEmail) {
      await sendMail({
        to: payment.customerEmail,
        subject: `Din ekstra bestilling til Bakkens Hvile — ${payment.bookingNo}`,
        html: orderEmailHtml({
          heading: `Tak for din ekstra bestilling${
            payment.customerName ? ", " + payment.customerName : ""
          }!`,
          bookingNo: payment.bookingNo,
          lineItems: payment.lineItems,
          discountKr,
          totalLabel: "Betalt nu",
          total: `${paidKr} kr.`,
          grandTotal: `${grandTotalKr} kr.`,
          footerNote:
            "Vi har lagt drikkevarerne til din bestilling. Vi glæder os til at se dig i Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.",
        }),
      });
    }
    return;
  }

  // flow === "billet": markér betalt og send billetten.
  await updateRecord(TABLES.bookings, payment.bookingId, {
    [FIELDS.booking.status]: "Betalt",
    [FIELDS.booking.totalPaid]: paidKr,
  });
  if (payment.customerEmail) {
    // Forestillingens detaljer hentes fra bookingen. Fejler opslaget, sendes
    // billetten stadig — blot uden de detaljer, vi ikke kunne hente.
    let showTitle = "";
    let showDateIso = "";
    let showTime = "";
    let seats = "";
    try {
      const bk = await getRecord(TABLES.bookings, payment.bookingId);
      const view = await buildBookingView(bk);
      showTitle = view.showTitle;
      showDateIso = view.showDate;
      showTime = view.showTime;
      seats = view.ticketBreakdown;
    } catch (e) {
      console.error("Kunne ikke hente forestillingsdata til billet");
    }
    const subtotalKr = paidKr + discountKr;
    await sendMail({
      to: payment.customerEmail,
      subject: showDateIso
        ? `Din billet til Bakkens Hvile ${daDateShort(showDateIso)} — ${payment.bookingNo}`
        : `Din billet til Bakkens Hvile — ${payment.bookingNo}`,
      html: ticketEmailHtml({
        customerName: payment.customerName ?? "",
        bookingNo: payment.bookingNo,
        showTitle,
        showDateIso,
        showTime,
        seats,
        isJubilee: showYear(showDateIso) === 2027,
        lineItems: payment.lineItems,
        subtotalKr,
        discountKr,
        totalKr: paidKr,
        discountLabel: ADDON_DISCOUNT_LABEL,
      }),
    });
  }
}
