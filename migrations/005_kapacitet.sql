-- Kapacitet og vaern mod oversalg af billetter.
--
-- Hvorfor to tabeller:
--
-- seat_counters er "pladsbogen": EN raekke pr. forestilling med fire tal, et
-- pr. priskategori, der siger hvor mange pladser der er taget lige nu
-- (reserveret + solgt). At alle fire tal ligger paa SAMME raekke er det, der
-- goer en bestilling paa tvaers af kategorier alt-eller-intet: reservationen
-- er en enkelt UPDATE med fire betingelser. Postgres laaser raekken under
-- opdateringen, og en samtidig koeber faar foerst lov bagefter og faar da
-- betingelserne proevet mod de NYE tal. To kunder kan derfor ikke begge faa
-- den sidste plads. Ville tallene ligge paa hver sin raekke, skulle fire
-- raekker laases i samme greb, og alt-eller-intet ville vaere langt svaerere
-- at vise er rigtigt.
--
-- seat_holds er selve bogfoeringen: en linje pr. bestilling pr. kategori, saa
-- vi kan se hvem, hvornaar og hvorfra, og saa udloebne reservationer kan
-- findes og gives tilbage. Den unikke indeks paa (booking_id, category)
-- gaelder paa tvaers af ALLE kilder (koeb, fribillet, import) og er dermed
-- vaernet mod at den samme booking taelles to gange.
--
-- Kapaciteten selv staar IKKE her. Den kommer fra Airtable (standardtal i
-- koden, eller ejerens justering paa forestillingen) og sendes med ind som
-- loft ved hver reservation. Saa skal intet holdes synkront.

CREATE TABLE IF NOT EXISTS seat_counters (
  show_id            text PRIMARY KEY,
  taken_aplus_front  integer NOT NULL DEFAULT 0 CHECK (taken_aplus_front >= 0),
  taken_aplus_back   integer NOT NULL DEFAULT 0 CHECK (taken_aplus_back >= 0),
  taken_a            integer NOT NULL DEFAULT 0 CHECK (taken_a >= 0),
  taken_b            integer NOT NULL DEFAULT 0 CHECK (taken_b >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seat_holds (
  id             bigserial PRIMARY KEY,
  show_id        text NOT NULL,
  booking_id     text NOT NULL,
  category       text NOT NULL
                 CHECK (category IN ('aplusForrest','aplusBagerst','a','b')),
  quantity       integer NOT NULL CHECK (quantity > 0),
  status         text NOT NULL DEFAULT 'held'
                 CHECK (status IN ('held','sold','released')),
  source         text NOT NULL
                 CHECK (source IN ('checkout','fribillet','import')),
  payment_ref    text,
  ticket_type_id text,
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seat_holds_booking_category_idx
  ON seat_holds (booking_id, category);

CREATE INDEX IF NOT EXISTS seat_holds_payment_idx
  ON seat_holds (payment_ref);

CREATE INDEX IF NOT EXISTS seat_holds_udloeb_idx
  ON seat_holds (show_id, status, expires_at);
