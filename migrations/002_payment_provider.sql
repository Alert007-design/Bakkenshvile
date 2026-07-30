-- Udbyder-uafhængig betalingsreference på ordrer. Erstatter den Stripe-
-- specifikke idempotens-garanti (unik constraint på stripe_checkout_session_id)
-- med en tilsvarende garanti på (payment_provider, payment_ref), så både Stripe
-- og Viva sikres mod, at én betaling kan give to ordrer.
--
-- De gamle stripe_*-kolonner beholdes indtil videre (rollback).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL
  DEFAULT 'stripe' CHECK (payment_provider IN ('stripe','viva'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_txn_id text;

-- Overfør eksisterende Stripe-referencer til de nye kolonner.
UPDATE orders SET payment_ref = stripe_checkout_session_id
 WHERE payment_ref IS NULL AND stripe_checkout_session_id IS NOT NULL;
UPDATE orders SET payment_txn_id = stripe_payment_intent_id
 WHERE payment_txn_id IS NULL AND stripe_payment_intent_id IS NOT NULL;

-- Hård idempotens-garanti: samme betaling kan aldrig bindes til to ordrer.
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_ref_key
  ON orders (payment_provider, payment_ref);
CREATE INDEX IF NOT EXISTS orders_payment_txn_idx ON orders (payment_txn_id);
