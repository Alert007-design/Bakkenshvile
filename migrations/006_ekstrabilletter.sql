-- Ekstra betalte billetter fra admin (ud over kapaciteten).
--
-- Personalet kan lægge betalte billetter ind til en fuld kategori. Pladserne
-- holdes i pladsbogen som en reservation med kilden 'ekstra', mens gæstens
-- betalingslink er gyldigt (24 timer), og bliver til et salg, når betalingen
-- er gennemført. Den eneste ændring er, at 'ekstra' tillades som kilde.
--
-- Migration 005 skal være kørt først.

ALTER TABLE seat_holds DROP CONSTRAINT IF EXISTS seat_holds_source_check;

ALTER TABLE seat_holds ADD CONSTRAINT seat_holds_source_check
  CHECK (source IN ('checkout','fribillet','import','ekstra'));
