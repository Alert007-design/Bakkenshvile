-- Store selskaber med betalingsfrist.
--
-- Personalet reserverer billetter til et stort selskab med en sidste
-- betalingsfrist, der kan ligge måneder ude. Pladserne holdes i pladsbogen med
-- kilden 'selskab' og UDEN udløbstid, så de aldrig frigives af sig selv — kun
-- når selskabet betaler (salg) eller reservationen annulleres.
--
-- group_reservations husker, hvad selskabet har bestilt, fristen, og hvornår
-- der er sendt påmindelse, betalt eller annulleret. Det daglige job læser
-- herfra i stedet for at gennemgå alle bookinger i Airtable.
--
-- Migration 006 skal være kørt først.

ALTER TABLE seat_holds DROP CONSTRAINT IF EXISTS seat_holds_source_check;

ALTER TABLE seat_holds ADD CONSTRAINT seat_holds_source_check
  CHECK (source IN ('checkout','fribillet','import','ekstra','selskab'));

CREATE TABLE IF NOT EXISTS group_reservations (
  booking_id        text PRIMARY KEY,
  booking_no        text NOT NULL UNIQUE,
  show_id           text NOT NULL,
  tickets           jsonb NOT NULL,
  deadline          date NOT NULL,
  customer_email    text NOT NULL,
  customer_name     text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  reminder_sent_at  timestamptz,
  paid_at           timestamptz,
  cancelled_at      timestamptz
);

CREATE INDEX IF NOT EXISTS group_reservations_aabne_idx
  ON group_reservations (deadline)
  WHERE paid_at IS NULL AND cancelled_at IS NULL;
