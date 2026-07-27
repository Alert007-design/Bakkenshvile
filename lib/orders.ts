// Autoritativ ordrelogik mod transaktionsdatabasen. Alle funktioner tager en
// Queryable, så de kan testes mod en indlejret Postgres.
//
// Kernegarantier:
//  - En betaling kan aldrig give to ordrer (unik constraint på
//    stripe_checkout_session_id + idempotent markOrderPaid).
//  - Gæsten kan kun tilgå sin egen ordre (opslag via hemmeligt public_token).
//  - Leveringsstatus kan kun flyttes gennem gyldige overgange (SELECT FOR
//    UPDATE + statusmaskine), også når to medarbejdere rører samme ordre.

import { randomBytes } from "crypto";
import type { Queryable } from "@/lib/db";
import {
  assertFulfillmentTransition,
  type FulfillmentStatus,
  type PaymentStatus,
} from "@/lib/order-status";

// DB-kolonnen (snake_case) der tidsstemples ved en given leveringsovergang.
// Hardcodet whitelist — værdien interpoleres i SQL, så den må aldrig komme
// fra brugerinput.
const FULFILLMENT_TS_COLUMN: Record<FulfillmentStatus, string | null> = {
  new: null,
  preparing: "started_at",
  ready: "ready_at",
  delivered: "delivered_at",
  cancelled: "cancelled_at",
};

export interface DraftOrderLine {
  menuItemId: string;
  productCode: string;
  name: string;
  quantity: number;
  unitPriceOre: number;
  vatRate: number;
  lineTotalOre: number;
}

export interface DraftOrderInput {
  eventId: string;
  tableNumber: number;
  guestName: string;
  message?: string;
  requestedDeliveryPhase: "now" | "interval";
  subtotalOre: number;
  vatOre: number;
  totalOre: number;
  lines: DraftOrderLine[];
}

export interface DraftOrderResult {
  id: string;
  publicToken: string;
  orderNumber: string;
}

/** Kryptografisk tilfældigt token til gæstens adgang til egen ordre. */
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Opretter en ordrekladde (payment_status = pending) med linjer i én
 * transaktion. Ordrenummeret tildeles fra en DB-sekvens (unikt).
 */
export async function createDraftOrder(
  db: Queryable,
  input: DraftOrderInput
): Promise<DraftOrderResult> {
  const publicToken = generatePublicToken();
  await db.query("BEGIN");
  try {
    const { rows } = await db.query<{ id: string; order_number: string }>(
      `INSERT INTO orders
         (public_token, order_number, event_id, table_number, guest_name,
          message, requested_delivery_phase, subtotal_ore, vat_ore, total_ore)
       VALUES
         ($1, 'BH-B-' || lpad(nextval('table_order_seq')::text, 5, '0'),
          $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, order_number`,
      [
        publicToken,
        input.eventId,
        input.tableNumber,
        input.guestName,
        input.message ?? null,
        input.requestedDeliveryPhase,
        input.subtotalOre,
        input.vatOre,
        input.totalOre,
      ]
    );
    const order = rows[0];
    for (const line of input.lines) {
      await db.query(
        `INSERT INTO order_lines
           (order_id, menu_item_id, product_code, name, quantity, unit_price_ore, vat_rate, line_total_ore)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          line.menuItemId,
          line.productCode,
          line.name,
          line.quantity,
          line.unitPriceOre,
          line.vatRate,
          line.lineTotalOre,
        ]
      );
    }
    await db.query("COMMIT");
    return { id: order.id, publicToken, orderNumber: order.order_number };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

/**
 * Kobler Stripe Checkout-sessionens ID på ordrekladden. Den unikke constraint
 * gør, at samme session aldrig kan bindes til to ordrer.
 */
export async function attachCheckoutSession(
  db: Queryable,
  orderId: string,
  sessionId: string
): Promise<void> {
  await db.query(
    `UPDATE orders SET stripe_checkout_session_id = $1 WHERE id = $2`,
    [sessionId, orderId]
  );
}

export type MarkPaidResult =
  | { status: "paid"; orderId: string }
  | { status: "already_paid"; orderId: string }
  | { status: "not_found" }
  | { status: "amount_mismatch"; orderId: string };

/**
 * Markerer ordren som betalt ud fra en verificeret Stripe-session. Idempotent
 * og sikker ved samtidige kald: kun overgangen pending → paid udføres, og kun
 * én gang. Beløb og valuta kontrolleres mod kladden, så en forfalsket eller
 * forkert betaling afvises.
 */
export async function markOrderPaid(
  db: Queryable,
  params: {
    sessionId: string;
    paymentIntentId?: string | null;
    amountTotalOre: number;
    currency: string;
  }
): Promise<MarkPaidResult> {
  const { rows } = await db.query<{
    id: string;
    total_ore: string | number;
    currency: string;
    payment_status: PaymentStatus;
  }>(
    `SELECT id, total_ore, currency, payment_status
       FROM orders WHERE stripe_checkout_session_id = $1`,
    [params.sessionId]
  );
  const order = rows[0];
  if (!order) return { status: "not_found" };
  if (order.payment_status === "paid") {
    return { status: "already_paid", orderId: order.id };
  }
  // Beløb og valuta skal matche kladden præcis.
  if (
    Number(order.total_ore) !== params.amountTotalOre ||
    order.currency.toLowerCase() !== params.currency.toLowerCase()
  ) {
    return { status: "amount_mismatch", orderId: order.id };
  }
  // Atomar, guardet overgang: kun hvis den stadig er pending. Vinder kun ét af
  // to samtidige webhookkald. RETURNING gør resultatet driver-uafhængigt
  // (pglite har ikke rowCount).
  const upd = await db.query<{ id: string }>(
    `UPDATE orders
        SET payment_status = 'paid',
            fulfillment_status = 'new',
            stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id),
            paid_at = now()
      WHERE id = $1 AND payment_status = 'pending'
      RETURNING id`,
    [order.id, params.paymentIntentId ?? null]
  );
  if (upd.rows.length === 0) return { status: "already_paid", orderId: order.id };
  return { status: "paid", orderId: order.id };
}

/** Markerer en betalt ordre som refunderet. */
export async function markOrderRefunded(
  db: Queryable,
  sessionId: string
): Promise<boolean> {
  const upd = await db.query<{ id: string }>(
    `UPDATE orders
        SET payment_status = 'refunded', refunded_at = now()
      WHERE stripe_checkout_session_id = $1 AND payment_status = 'paid'
      RETURNING id`,
    [sessionId]
  );
  return upd.rows.length > 0;
}

export interface OrderLineView {
  name: string;
  quantity: number;
  unitPriceOre: number;
  lineTotalOre: number;
}

export interface GuestOrderView {
  orderNumber: string;
  tableNumber: number;
  totalOre: number;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  lines: OrderLineView[];
}

/**
 * Henter gæstens egen ordre via det hemmelige public_token. Returnerer KUN
 * ufølsomme felter for netop den ordre — aldrig andre gæsters data, interne
 * noter eller betalingshemmeligheder. Ukendt token → null.
 */
export async function getOrderForGuest(
  db: Queryable,
  publicToken: string
): Promise<GuestOrderView | null> {
  const { rows } = await db.query<{
    id: string;
    order_number: string;
    table_number: number;
    total_ore: string | number;
    payment_status: PaymentStatus;
    fulfillment_status: FulfillmentStatus;
  }>(
    `SELECT id, order_number, table_number, total_ore, payment_status, fulfillment_status
       FROM orders WHERE public_token = $1`,
    [publicToken]
  );
  const o = rows[0];
  if (!o) return null;
  const { rows: lines } = await db.query<{
    name: string;
    quantity: number;
    unit_price_ore: string | number;
    line_total_ore: string | number;
  }>(
    `SELECT name, quantity, unit_price_ore, line_total_ore
       FROM order_lines WHERE order_id = $1 ORDER BY id`,
    [o.id]
  );
  return {
    orderNumber: o.order_number,
    tableNumber: o.table_number,
    totalOre: Number(o.total_ore),
    paymentStatus: o.payment_status,
    fulfillmentStatus: o.fulfillment_status,
    lines: lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPriceOre: Number(l.unit_price_ore),
      lineTotalOre: Number(l.line_total_ore),
    })),
  };
}

/**
 * Flytter en ordres leveringsstatus gennem en gyldig overgang. Låser rækken
 * (FOR UPDATE), så to medarbejdere ikke kan lave modstridende skift samtidigt.
 * Kaster ved en ugyldig overgang. Returnerer den nye status.
 */
export async function setFulfillmentStatus(
  db: Queryable,
  orderId: string,
  to: FulfillmentStatus
): Promise<FulfillmentStatus> {
  await db.query("BEGIN");
  try {
    const { rows } = await db.query<{
      fulfillment_status: FulfillmentStatus;
      payment_status: PaymentStatus;
    }>(
      `SELECT fulfillment_status, payment_status FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const current = rows[0];
    if (!current) throw new Error("Ordre findes ikke");
    // Kun betalte ordrer kan behandles i baren.
    if (current.payment_status !== "paid") {
      throw new Error("Ordren er ikke betalt");
    }
    assertFulfillmentTransition(current.fulfillment_status, to);

    const tsColumn = FULFILLMENT_TS_COLUMN[to];
    const setTs = tsColumn ? `, ${tsColumn} = now()` : "";
    await db.query(
      `UPDATE orders SET fulfillment_status = $1${setTs} WHERE id = $2`,
      [to, orderId]
    );
    await db.query("COMMIT");
    return to;
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

export interface BarOrderView {
  id: string;
  orderNumber: string;
  tableNumber: number;
  guestName: string;
  message: string | null;
  requestedDeliveryPhase: "now" | "interval";
  totalOre: number;
  fulfillmentStatus: FulfillmentStatus;
  createdAt: string;
  lines: OrderLineView[];
}

/**
 * Aktive ordrer for baren: betalte ordrer for et event, der endnu ikke er
 * leveret/annulleret. Ældste først.
 */
export async function listActiveOrders(
  db: Queryable,
  eventId: string
): Promise<BarOrderView[]> {
  const { rows } = await db.query<{
    id: string;
    order_number: string;
    table_number: number;
    guest_name: string;
    message: string | null;
    requested_delivery_phase: "now" | "interval";
    total_ore: string | number;
    fulfillment_status: FulfillmentStatus;
    created_at: string;
  }>(
    `SELECT id, order_number, table_number, guest_name, message,
            requested_delivery_phase, total_ore, fulfillment_status, created_at
       FROM orders
      WHERE event_id = $1
        AND payment_status = 'paid'
        AND fulfillment_status IN ('new','preparing','ready')
      ORDER BY created_at ASC`,
    [eventId]
  );
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { rows: lineRows } = await db.query<{
    order_id: string;
    name: string;
    quantity: number;
    unit_price_ore: string | number;
    line_total_ore: string | number;
  }>(
    `SELECT order_id, name, quantity, unit_price_ore, line_total_ore
       FROM order_lines WHERE order_id = ANY($1) ORDER BY id`,
    [ids]
  );
  const linesByOrder = new Map<string, OrderLineView[]>();
  for (const l of lineRows) {
    if (!linesByOrder.has(l.order_id)) linesByOrder.set(l.order_id, []);
    linesByOrder.get(l.order_id)!.push({
      name: l.name,
      quantity: l.quantity,
      unitPriceOre: Number(l.unit_price_ore),
      lineTotalOre: Number(l.line_total_ore),
    });
  }

  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    tableNumber: r.table_number,
    guestName: r.guest_name,
    message: r.message,
    requestedDeliveryPhase: r.requested_delivery_phase,
    totalOre: Number(r.total_ore),
    fulfillmentStatus: r.fulfillment_status,
    createdAt: String(r.created_at),
    lines: linesByOrder.get(r.id) ?? [],
  }));
}
