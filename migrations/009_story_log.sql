-- Stories på Facebook og Instagram (/api/cron/stories). Én række pr. dag,
-- tidspunkt og platform, så en story højst lægges op én gang. Rækken
-- oprettes FØR kaldet til Meta (status 'i_gang'), så to samtidige kørsler
-- ikke begge kan lægge op. Fejl prøves ikke igen af sig selv: et kald, hvis
-- svar vi ikke fik, kan godt være gået igennem hos Meta.
--
-- Status: i_gang -> lagt | fejl. 'kladde' = billedet er lavet, men intet er
-- lagt op (STORIES_TILSTAND=kladde eller skabelonen er ikke godkendt).

CREATE TABLE IF NOT EXISTS story_log (
  dato        date NOT NULL,
  slot        text NOT NULL CHECK (slot IN ('morgen','eftermiddag')),
  platform    text NOT NULL CHECK (platform IN ('facebook','instagram')),
  type        text NOT NULL,
  status      text NOT NULL CHECK (status IN ('i_gang','lagt','fejl','kladde')),
  meta_id     text,
  besked      text,
  oprettet    timestamptz NOT NULL DEFAULT now(),
  opdateret   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dato, slot, platform)
);

CREATE INDEX IF NOT EXISTS story_log_dato_idx ON story_log (dato DESC);
