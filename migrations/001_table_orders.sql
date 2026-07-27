-- Transaktionsdatabase for QR-bordbestillingen (Vercel Postgres).
-- Autoritativ kilde til ordrer, ordrelinjer og salens tilstand. Airtable er
-- kun spejling/rapportering og aldrig eneste værn mod dobbeltordrer.

-- Salens tilstand pr. forestilling (event).
CREATE TABLE IF NOT EXISTS hall_state (
  event_id      text PRIMARY KEY,
  state         text NOT NULL DEFAULT 'closed'
                CHECK (state IN ('before_show','show','interval','closed')),
  ordering_open boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Løbenummer til pæne, unikke ordrenumre (BH-B-00001, ...).
CREATE SEQUENCE IF NOT EXISTS table_order_seq;

CREATE TABLE IF NOT EXISTS orders (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token               text NOT NULL UNIQUE,
  order_number               text NOT NULL UNIQUE,
  event_id                   text NOT NULL,
  table_number               int  NOT NULL,
  guest_name                 text NOT NULL,
  message                    text,
  requested_delivery_phase   text NOT NULL DEFAULT 'now'
                             CHECK (requested_delivery_phase IN ('now','interval')),
  currency                   text NOT NULL DEFAULT 'dkk' CHECK (currency = 'dkk'),
  subtotal_ore               bigint NOT NULL,
  vat_ore                    bigint NOT NULL,
  total_ore                  bigint NOT NULL,
  payment_status             text NOT NULL DEFAULT 'pending'
                             CHECK (payment_status IN ('pending','paid','failed','refunded')),
  fulfillment_status         text NOT NULL DEFAULT 'new'
                             CHECK (fulfillment_status IN ('new','preparing','ready','delivered','cancelled')),
  -- Hård idempotens-garanti: én betaling kan aldrig give to ordrer.
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id   text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  paid_at                    timestamptz,
  started_at                 timestamptz,
  ready_at                   timestamptz,
  delivered_at               timestamptz,
  cancelled_at               timestamptz,
  refunded_at                timestamptz
);

CREATE INDEX IF NOT EXISTS orders_event_status_idx
  ON orders (event_id, payment_status, fulfillment_status);

CREATE TABLE IF NOT EXISTS order_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id   text NOT NULL,
  product_code   text NOT NULL,
  name           text NOT NULL,
  quantity       int  NOT NULL CHECK (quantity > 0),
  unit_price_ore bigint NOT NULL,
  vat_rate       numeric NOT NULL,
  line_total_ore bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS order_lines_order_idx ON order_lines (order_id);
