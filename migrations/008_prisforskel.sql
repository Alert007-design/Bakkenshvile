-- 008: Betaling af prisforskel ved flytning af en reservation til en dyrere
-- dato (/admin/opslag). Betalingen gemmes i ticket_payments som et nyt flow,
-- "prisforskel", så webhooken kan kende den fra et billetkøb og en
-- genbestilling. Kun reglen for tilladte flows ændres; ingen data røres.
-- Kan køres flere gange uden skade.

ALTER TABLE ticket_payments DROP CONSTRAINT IF EXISTS ticket_payments_flow_check;

ALTER TABLE ticket_payments ADD CONSTRAINT ticket_payments_flow_check
  CHECK (flow IN ('billet','genbestil','prisforskel'));
