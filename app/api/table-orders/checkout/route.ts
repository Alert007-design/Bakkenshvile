import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getMenuMap } from "@/lib/menu";
import { validateCheckout } from "@/lib/checkout";
import { createDraftOrder, attachPaymentRef, getPaymentRef } from "@/lib/orders";
import { getPaymentProvider, getConfiguredProviderName, assertVivaLiveAllowed } from "@/lib/payments";
import type { PaymentProvider } from "@/lib/payments/types";
import { isOrderingOpen } from "@/lib/hall-state";
import { parseTableNumber } from "@/lib/tables";
import { verifyTableToken } from "@/lib/table-tokens";
import { rateLimit } from "@/lib/rate-limit";
import {
  assertLivePaymentAllowed,
  CHECKOUT_EXPIRY_MINUTES,
  CHECKOUT_RATE_LIMIT,
  CHECKOUT_RATE_WINDOW_MS,
  isOrderingEnabled,
} from "@/lib/table-ordering-config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Sikkerhedskontakt: intet tages imod før bordbestilling er slået til.
  if (!isOrderingEnabled()) {
    return NextResponse.json({ error: "Bordbestilling er ikke aktiv." }, { status: 403 });
  }
  // Livebetaling er umulig uden eksplicit live-tilstand (fejler lukket) — for
  // begge udbydere. Viva-værnet ligger i getPaymentProvider(); Stripe-værnet
  // tjekker nøglen direkte.
  let provider: PaymentProvider;
  try {
    if (getConfiguredProviderName() === "viva") {
      assertVivaLiveAllowed();
    } else {
      assertLivePaymentAllowed(process.env.STRIPE_SECRET_KEY);
    }
    provider = getPaymentProvider();
  } catch {
    return NextResponse.json({ error: "Bordbestilling er ikke aktiv." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Bord fra allowlist + event.
  const table = parseTableNumber(b.tableNumber);
  const eventId = typeof b.eventId === "string" ? b.eventId : "";
  if (!eventId) {
    return NextResponse.json({ error: "Ugyldigt event." }, { status: 400 });
  }

  // Rate limiting pr. IP + bord (dobbeltklik-/spam-værn).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukendt";
  const rl = rateLimit(
    `checkout:${ip}:${table?.number ?? "?"}`,
    CHECKOUT_RATE_LIMIT,
    CHECKOUT_RATE_WINDOW_MS
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "For mange forsøg lige nu. Vent et øjeblik og prøv igen." },
      { status: 429 }
    );
  }

  // Token-verifikation + bestillingsåbning + menu (alt serverside).
  const tokenValid = table ? verifyTableToken(table.number, b.tableToken) : false;
  const db = getDb();
  const [orderingOpen, menu] = await Promise.all([isOrderingOpen(db, eventId), getMenuMap()]);

  const result = validateCheckout(body, { table, tokenValid, orderingOpen, eventId, menu });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  try {
    // Ordrekladde oprettes FØR betalingen, så dens ID kan ligge i metadata/tags.
    const order = await createDraftOrder(db, result.draft);
    const origin = req.nextUrl.origin;

    // Findes der allerede en reference (dobbelt-POST), genbruges den — vores
    // egen idempotens, uafhængigt af udbyder.
    const existingRef = await getPaymentRef(db, order.id);

    const payment = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      publicToken: order.publicToken,
      eventId,
      tableNumber: result.draft.tableNumber,
      totalOre: result.draft.totalOre,
      currency: "dkk",
      description: `Bakkens Hvile · bord ${result.draft.tableNumber} · ${order.orderNumber}`,
      origin,
      expiresInMinutes: CHECKOUT_EXPIRY_MINUTES,
      existingRef,
    });

    await attachPaymentRef(db, order.id, provider.name, payment.paymentRef);

    const res = NextResponse.json({
      url: payment.redirectUrl,
      orderNumber: order.orderNumber,
      publicToken: order.publicToken,
    });
    // Kvitteringssiden kan finde ordren efter redirect fra Viva (som ikke kan
    // bære publicToken i success-URL'en, da den er fælles for alle betalinger).
    // sameSite=lax, så cookien overlever redirect'et tilbage.
    res.cookies.set("bh_bord_ordre", order.publicToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/bord",
      maxAge: 3600,
    });
    return res;
  } catch (err) {
    console.error("Bordbestilling-checkout fejlede", err);
    return NextResponse.json(
      { error: "Bestillingen kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
