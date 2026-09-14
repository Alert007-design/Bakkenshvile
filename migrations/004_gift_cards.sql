-- Gavekort (fase 1). Egen tabel, adskilt fra billet-ledgeren, fordi et gavekort
-- har sin egen livscyklus: en unik indløsningskode, en udloebsdato (3 aar) og
-- en "brugt"-markering. payment_ref = Vivas orderCode (16-cifret streng), sat
-- ved checkout. code genereres foerst ved betaling og er unik. Beloeb i oere.
--
-- Status: pending -> paid (kode + udloeb saettes) -> used (manuel indloesning i
-- fase 1). failed/refunded er endestationer. Beloebskontrollen (amount_ore mod
-- det Viva trak) og den guardede pending -> paid-overgang giver samme
-- idempotens/"praecis een gang"-garanti som ticket_payments.

CREATE TABLE IF NOT EXISTS gift_cards (
  payment_ref     text PRIMARY KEY,
  gift_card_no    text NOT NULL,
  code            text UNIQUE,
  amount_ore      bigint NOT NULL,
  currency        text NOT NULL DEFAULT 'dkk' CHECK (currency = 'dkk'),
  purchaser_name  text NOT NULL,
  purchaser_email text NOT NULL,
  purchaser_phone text,
  recipient_email text NOT NULL,
  message         text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','failed','refunded','used')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  expires_at      timestamptz,
  used_at         timestamptz,
  used_by         text
);

CREATE INDEX IF NOT EXISTS gift_cards_code_idx ON gift_cards (code);

CREATE INDEX IF NOT EXISTS gift_cards_status_idx ON gift_cards (status);
