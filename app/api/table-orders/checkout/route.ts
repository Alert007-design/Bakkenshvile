import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { getMenuMap } from "@/lib/menu";
import { validateCheckout } from "@/lib/checkout";
import { createDraftOrder, attachCheckoutSession } from "@/lib/orders";
import { isOrderingOpen } from "@/lib/hall-state";
import { parseTableNumber } from "@/lib/tables";
import { verifyTableToken } from "@/lib/table-tokens";
import { rateLimit } from "@/lib/rate-limit";
import {
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
    // Ordrekladde oprettes FØR Stripe-sessionen, så dens ID kan ligge i metadata.
    const order = await createDraftOrder(db, result.draft);
    const stripe = getStripe();
    const origin = req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // payment_method_types udelades bevidst: Stripe Checkout viser så de
        // metoder der er slået til i Dashboard (MobilePay + kort) og vælger
        // selv visning/rækkefølge ud fra enhed, beløb og gæstens placering.
        locale: "da",
        currency: "dkk",
        line_items: result.stripeLines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: "dkk",
            unit_amount: l.unitAmountOre, // allerede i øre
            product_data: { name: l.name },
          },
        })),
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_MINUTES * 60,
        metadata: {
          kind: "table-order",
          orderId: order.id,
          tableNumber: String(result.draft.tableNumber),
          eventId,
        },
        // publicToken lægges med, så kvitteringssiden kan polle egen ordre.
        success_url: `${origin}/bord/${result.draft.tableNumber}/kvittering?session_id={CHECKOUT_SESSION_ID}&t=${order.publicToken}`,
        cancel_url: `${origin}/bord/${result.draft.tableNumber}?afbrudt=1`,
      },
      // Idempotency: dobbelt-POST for samme kladde giver samme session.
      { idempotencyKey: `table-checkout-${order.id}` }
    );

    await attachCheckoutSession(db, order.id, session.id);

    return NextResponse.json({
      url: session.url,
      orderNumber: order.orderNumber,
      publicToken: order.publicToken,
    });
  } catch (err) {
    console.error("Bordbestilling-checkout fejlede", err);
    return NextResponse.json(
      { error: "Bestillingen kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
