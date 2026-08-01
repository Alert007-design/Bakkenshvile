// Ledger-logik for billet- og genbestillingsbetalinger (Viva).
//
// Alle funktioner tager en Queryable, så de kan testes mod en indlejret
// Postgres (pglite). Beløb er altid i HELE ØRE.
//
// Kernegarantier (jf. migrations/003_ticket_payments.sql):
//  - Beløbskontrol mod det gemte forventede total, før noget markeres betalt.
//  - Idempotent "præcis én gang": pending → paid udføres kun én gang, også ved
//    to samtidige webhook-kald (guardet UPDATE ... WHERE status='pending').
//  - Fail-closed: ukendt reference, forkert beløb/valuta → ingen ændring.

import type { Queryable } from "@/lib/db";

export type TicketFlow = "billet" | "genbestil";

export interface TicketLineItem {
  description: string;
  quantity: number;
  amountSubtotalOre: number; // linjens beløb i øre (efter evt. rabat på totalen)
}

export interface TicketPaymentRow {
  paymentRef: string;
  flow: TicketFlow;
  bookingId: string;
  bookingNo: string;
  customerEmail: string | null;
  customerName: string | null;
  currency: string;
  expectedTotalOre: number;
  discountOre: number;
  lineItems: TicketLineItem[];
  status: "pending" | "paid" | "failed" | "refunded";
}

interface TicketPaymentDbRow {
  payment_ref: string;
  flow: TicketFlow;
  booking_id: string;
  booking_no: string;
  customer_email: string | null;
  customer_name: string | null;
  currency: string;
  expected_total_ore: string | number;
  discount_ore: string | number;
  line_items: string;
  status: "pending" | "paid" | "failed" | "refunded";
}

function toRow(r: TicketPaymentDbRow): TicketPaymentRow {
  let lineItems: TicketLineItem[] = [];
  try {
    const parsed = JSON.parse(r.line_items);
    if (Array.isArray(parsed)) lineItems = parsed as TicketLineItem[];
  } catch {
    lineItems = [];
  }
  return {
    paymentRef: r.payment_ref,
    flow: r.flow,
    bookingId: r.booking_id,
    bookingNo: r.booking_no,
    customerEmail: r.customer_email,
    customerName: r.customer_name,
    currency: r.currency,
    expectedTotalOre: Number(r.expected_total_ore),
    discountOre: Number(r.discount_ore),
    lineItems,
    status: r.status,
  };
}

export interface CreateTicketPaymentInput {
  paymentRef: string;
  flow: TicketFlow;
  bookingId: string;
  bookingNo: string;
  customerEmail?: string | null;
  customerName?: string | null;
  expectedTotalOre: number;
  discountOre?: number;
  lineItems: TicketLineItem[];
}

/**
 * Registrerer en betaling ved checkout (status = pending) med det forventede
 * total, som webhooken senere kontrollerer det trukne beløb imod.
 */
export async function createTicketPayment(
  db: Queryable,
  input: CreateTicketPaymentInput
): Promise<void> {
  await db.query(
    `INSERT INTO ticket_payments
       (payment_ref, flow, booking_id, booking_no, customer_email, customer_name,
        expected_total_ore, discount_ore, line_items)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (payment_ref) DO NOTHING`,
    [
      input.paymentRef,
      input.flow,
      input.bookingId,
      input.bookingNo,
      input.customerEmail ?? null,
      input.customerName ?? null,
      input.expectedTotalOre,
      input.discountOre ?? 0,
      JSON.stringify(input.lineItems ?? []),
    ]
  );
}

/** Henter en ledger-post (null hvis ukendt reference). */
export async function getTicketPayment(
  db: Queryable,
  paymentRef: string
): Promise<TicketPaymentRow | null> {
  const { rows } = await db.query<TicketPaymentDbRow>(
    `SELECT * FROM ticket_payments WHERE payment_ref = $1`,
    [paymentRef]
  );
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Nyeste ledger-post for en booking (evt. filtreret på flow). Bruges ved
 * gensend af billet-mailen, hvor de præcise linjer/beløb skal hentes for en
 * Viva-betalt booking. Returnerer null for fx en fribillet uden ledger-post.
 */
export async function getLatestTicketPaymentByBooking(
  db: Queryable,
  bookingId: string,
  flow?: TicketFlow
): Promise<TicketPaymentRow | null> {
  const { rows } = flow
    ? await db.query<TicketPaymentDbRow>(
        `SELECT * FROM ticket_payments
          WHERE booking_id = $1 AND flow = $2
          ORDER BY created_at DESC LIMIT 1`,
        [bookingId, flow]
      )
    : await db.query<TicketPaymentDbRow>(
        `SELECT * FROM ticket_payments
          WHERE booking_id = $1
          ORDER BY created_at DESC LIMIT 1`,
        [bookingId]
      );
  return rows[0] ? toRow(rows[0]) : null;
}

export type MarkTicketPaidResult =
  | { status: "paid"; payment: TicketPaymentRow }
  | { status: "already_paid"; payment: TicketPaymentRow }
  | { status: "not_found" }
  | { status: "amount_mismatch"; payment: TicketPaymentRow };

/**
 * Markerer en betaling som betalt ud fra en verificeret Viva-transaktion.
 * Kontrollerer beløb + valuta mod det gemte total og udfører kun overgangen
 * pending → paid én gang. Ved "paid" returneres posten, så kalderen kan
 * opdatere Airtable og sende mail — men KUN den kalder, der faktisk vandt
 * overgangen (exactly-once).
 */
export async function markTicketPaidByRef(
  db: Queryable,
  params: { paymentRef: string; amountOre: number; currency: string }
): Promise<MarkTicketPaidResult> {
  const existing = await getTicketPayment(db, params.paymentRef);
  if (!existing) return { status: "not_found" };
  if (existing.status === "paid") {
    return { status: "already_paid", payment: existing };
  }
  if (
    existing.expectedTotalOre !== params.amountOre ||
    existing.currency.toLowerCase() !== params.currency.toLowerCase()
  ) {
    return { status: "amount_mismatch", payment: existing };
  }
  const upd = await db.query<{ payment_ref: string }>(
    `UPDATE ticket_payments
        SET status = 'paid', paid_at = now()
      WHERE payment_ref = $1 AND status = 'pending'
      RETURNING payment_ref`,
    [params.paymentRef]
  );
  if (upd.rows.length === 0) {
    // En samtidig kalder vandt overgangen først.
    return { status: "already_paid", payment: existing };
  }
  return { status: "paid", payment: existing };
}

/**
 * Frigiver en vundet paid-overgang igen (tilbage til pending), hvis en
 * efterfølgende sideeffekt (Airtable/mail) fejlede. Så kan Vivas genforsøg
 * behandle betalingen forfra — intet markeres betalt uden fuldført sideeffekt.
 */
export async function revertTicketPaidByRef(
  db: Queryable,
  paymentRef: string
): Promise<void> {
  await db.query(
    `UPDATE ticket_payments
        SET status = 'pending', paid_at = NULL
      WHERE payment_ref = $1 AND status = 'paid'`,
    [paymentRef]
  );
}

/** Markerer en ubetalt betaling som fejlet (udløbet/afvist). */
export async function markTicketFailedByRef(
  db: Queryable,
  paymentRef: string
): Promise<boolean> {
  const upd = await db.query<{ payment_ref: string }>(
    `UPDATE ticket_payments
        SET status = 'failed'
      WHERE payment_ref = $1 AND status = 'pending'
      RETURNING payment_ref`,
    [paymentRef]
  );
  return upd.rows.length > 0;
}

/** Markerer en betalt betaling som refunderet. */
export async function markTicketRefundedByRef(
  db: Queryable,
  paymentRef: string
): Promise<boolean> {
  const upd = await db.query<{ payment_ref: string }>(
    `UPDATE ticket_payments
        SET status = 'refunded'
      WHERE payment_ref = $1 AND status = 'paid'
      RETURNING payment_ref`,
    [paymentRef]
  );
  return upd.rows.length > 0;
}
