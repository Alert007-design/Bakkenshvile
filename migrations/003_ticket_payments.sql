-- Betalingsledger for billetkøb og genbestilling (Viva).
--
-- Billetverdenen er autoritativt i Airtable, men Airtable kan hverken lave en
-- atomar "kun hvis stadig ubetalt"-opdatering eller en unik constraint. Denne
-- lille Postgres-tabel giver derfor to garantier, som webhooken kræver:
--   1) Beløbskontrol: det forventede total (i øre) gemmes ved checkout og
--      sammenlignes med det beløb, Viva rent faktisk trak — et uafhængigt
--      krydstjek, præcis som orders.total_ore for bordbestillingen.
--   2) Idempotens/"præcis én gang": den guardede overgang pending → paid vinder
--      kun for ét af flere samtidige webhook-kald (rækkelås på primærnøglen).
--
-- payment_ref = Vivas orderCode (16-cifret streng). line_items gemmes som JSON
-- (tekst), så bekræftelsesmailen kan gendannes uden at kalde Viva igen.

CREATE TABLE IF NOT EXISTS ticket_payments (
  payment_ref        text PRIMARY KEY,
  flow               text NOT NULL CHECK (flow IN ('billet','genbestil')),
  booking_id         text NOT NULL,
  booking_no         text NOT NULL,
  customer_email     text,
  customer_name      text,
  currency           text NOT NULL DEFAULT 'dkk' CHECK (currency = 'dkk'),
  expected_total_ore bigint NOT NULL,
  discount_ore       bigint NOT NULL DEFAULT 0,
  line_items         text NOT NULL DEFAULT '[]',
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed','refunded')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz
);

CREATE INDEX IF NOT EXISTS ticket_payments_booking_idx
  ON ticket_payments (booking_id);
