// Gavekort-ledger (fase 1). Samme princip som lib/ticket-payments.ts: en lille
// Postgres-tabel giver beløbskontrol og en guarded "kun hvis stadig ubetalt"-
// overgang, som webhooken kræver. Gavekortet har derudover sin egen kode,
// udløbsdato (3 år) og "brugt"-markering (manuel indløsning i fase 1).
//
// Alle funktioner er rene i den forstand, at de tager en Queryable ind — det
// gør dem testbare mod en midlertidig database, præcis som ticket-payments.

import { randomInt } from "crypto";
import type { Queryable } from "@/lib/db";

export type GiftCardStatus = "pending" | "paid" | "failed" | "refunded" | "used";

/** Gavekortets gyldighed fra betalingstidspunktet. */
export const GIFT_CARD_VALIDITY_YEARS = 3;

export interface GiftCardRow {
  paymentRef: string;
  giftCardNo: string;
  code: string | null;
  amountOre: number;
  currency: string;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string | null;
  recipientEmail: string;
  message: string | null;
  status: GiftCardStatus;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  usedBy: string | null;
}

function mapRow(r: Record<string, unknown>): GiftCardRow {
  return {
    paymentRef: String(r.payment_ref),
    giftCardNo: String(r.gift_card_no),
    code: r.code == null ? null : String(r.code),
    amountOre: Number(r.amount_ore),
    currency: String(r.currency),
    purchaserName: String(r.purchaser_name),
    purchaserEmail: String(r.purchaser_email),
    purchaserPhone: r.purchaser_phone == null ? null : String(r.purchaser_phone),
    recipientEmail: String(r.recipient_email),
    message: r.message == null ? null : String(r.message),
    status: String(r.status) as GiftCardStatus,
    createdAt: r.created_at == null ? "" : new Date(r.created_at as string).toISOString(),
    paidAt: r.paid_at == null ? null : new Date(r.paid_at as string).toISOString(),
    expiresAt: r.expires_at == null ? null : new Date(r.expires_at as string).toISOString(),
    usedAt: r.used_at == null ? null : new Date(r.used_at as string).toISOString(),
    usedBy: r.used_by == null ? null : String(r.used_by),
  };
}

/** Internt, menneskeligt gavekortnummer (ikke indløsningskoden). */
export function generateGiftCardNo(): string {
  return `GK-${Date.now().toString().slice(-8)}`;
}

// Indløsningskode: to grupper à fire tegn fra et alfabet uden 0/O/1/I, så koden
// kan læses op og skrives af uden tvivl. Præfiks "BH" gør den genkendelig.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBlock(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export function generateGiftCardCode(): string {
  return `BH-${randomBlock(4)}-${randomBlock(4)}`;
}

export interface CreateGiftCardInput {
  paymentRef: string;
  giftCardNo: string;
  amountOre: number;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone?: string | null;
  recipientEmail: string;
  message?: string | null;
}

/** Indsætter en pending gavekort-række. Idempotent (ON CONFLICT DO NOTHING). */
export async function createGiftCard(db: Queryable, input: CreateGiftCardInput): Promise<void> {
  await db.query(
    `INSERT INTO gift_cards
       (payment_ref, gift_card_no, amount_ore, purchaser_name, purchaser_email,
        purchaser_phone, recipient_email, message, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     ON CONFLICT (payment_ref) DO NOTHING`,
    [
      input.paymentRef,
      input.giftCardNo,
      input.amountOre,
      input.purchaserName,
      input.purchaserEmail,
      input.purchaserPhone ?? null,
      input.recipientEmail,
      input.message ?? null,
    ]
  );
}

export async function getGiftCardByRef(db: Queryable, paymentRef: string): Promise<GiftCardRow | null> {
  const res = await db.query("SELECT * FROM gift_cards WHERE payment_ref = $1", [paymentRef]);
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function getGiftCardByCode(db: Queryable, code: string): Promise<GiftCardRow | null> {
  const res = await db.query("SELECT * FROM gift_cards WHERE code = $1", [code.trim().toUpperCase()]);
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function listGiftCards(db: Queryable, limit = 200): Promise<GiftCardRow[]> {
  const res = await db.query("SELECT * FROM gift_cards ORDER BY created_at DESC LIMIT $1", [limit]);
  return res.rows.map(mapRow);
}

export type MarkGiftCardPaidResult =
  | { status: "paid"; card: GiftCardRow }
  | { status: "already_paid"; card: GiftCardRow }
  | { status: "not_found" }
  | { status: "amount_mismatch"; card: GiftCardRow };

/**
 * Guarded pending → paid. Verificerer beløb og valuta mod den gemte ordre,
 * genererer en unik kode og sætter udløbsdato (nu + 3 år). Kun én samtidig
 * webhook vinder overgangen; øvrige får already_paid. Kodekollision (unik
 * constraint) håndteres ved at prøve en ny kode.
 */
export async function markGiftCardPaidByRef(
  db: Queryable,
  params: { paymentRef: string; amountOre: number; currency: string }
): Promise<MarkGiftCardPaidResult> {
  const existing = await getGiftCardByRef(db, params.paymentRef);
  if (!existing) return { status: "not_found" };
  if (existing.status === "paid" || existing.status === "used") {
    return { status: "already_paid", card: existing };
  }
  if (
    existing.amountOre !== params.amountOre ||
    existing.currency.toLowerCase() !== params.currency.toLowerCase()
  ) {
    return { status: "amount_mismatch", card: existing };
  }

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + GIFT_CARD_VALIDITY_YEARS);
  const expiresIso = expires.toISOString();

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateGiftCardCode();
    try {
      const res = await db.query(
        `UPDATE gift_cards
            SET status = 'paid', paid_at = now(), code = $2, expires_at = $3
          WHERE payment_ref = $1 AND status = 'pending'
          RETURNING *`,
        [params.paymentRef, code, expiresIso]
      );
      // RETURNING gør resultatet driver-uafhængigt (pglite har ikke rowCount).
      if (res.rows[0]) {
        return { status: "paid", card: mapRow(res.rows[0]) };
      }
      // Ingen række opdateret: en anden vandt overgangen, eller status skiftede.
      const now = await getGiftCardByRef(db, params.paymentRef);
      if (now && (now.status === "paid" || now.status === "used")) {
        return { status: "already_paid", card: now };
      }
      return { status: "not_found" };
    } catch (err) {
      // 23505 = unik constraint (kodekollision) → prøv en ny kode.
      if ((err as { code?: string }).code === "23505") continue;
      throw err;
    }
  }
  throw new Error("Kunne ikke generere en unik gavekortkode efter flere forsøg");
}

/** Ruller en vundet paid-overgang tilbage, hvis en sideeffekt (mail) fejlede. */
export async function revertGiftCardPaidByRef(db: Queryable, paymentRef: string): Promise<void> {
  await db.query(
    `UPDATE gift_cards
        SET status = 'pending', code = NULL, paid_at = NULL, expires_at = NULL
      WHERE payment_ref = $1 AND status = 'paid'`,
    [paymentRef]
  );
}

export async function markGiftCardFailedByRef(db: Queryable, paymentRef: string): Promise<boolean> {
  const res = await db.query(
    "UPDATE gift_cards SET status = 'failed' WHERE payment_ref = $1 AND status = 'pending' RETURNING payment_ref",
    [paymentRef]
  );
  return res.rows.length > 0;
}

export async function markGiftCardRefundedByRef(db: Queryable, paymentRef: string): Promise<boolean> {
  const res = await db.query(
    "UPDATE gift_cards SET status = 'refunded' WHERE payment_ref = $1 AND status = 'paid' RETURNING payment_ref",
    [paymentRef]
  );
  return res.rows.length > 0;
}

export type MarkGiftCardUsedResult =
  | { status: "used"; card: GiftCardRow }
  | { status: "not_found" }
  | { status: "not_payable"; card: GiftCardRow };

/** Markerer et betalt gavekort som brugt (manuel indløsning i fase 1). */
export async function markGiftCardUsed(
  db: Queryable,
  code: string,
  usedBy: string
): Promise<MarkGiftCardUsedResult> {
  const normalized = code.trim().toUpperCase();
  const res = await db.query(
    `UPDATE gift_cards
        SET status = 'used', used_at = now(), used_by = $2
      WHERE code = $1 AND status = 'paid'
      RETURNING *`,
    [normalized, usedBy]
  );
  if (res.rows[0]) {
    return { status: "used", card: mapRow(res.rows[0]) };
  }
  const current = await getGiftCardByCode(db, normalized);
  if (!current) return { status: "not_found" };
  return { status: "not_payable", card: current };
}
