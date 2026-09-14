# Kør migration 004 (gavekort) mod databasen — klik for klik

Migrationer køres ikke automatisk i produktion. `migrations/004_gift_cards.sql`
opretter tabellen `gift_cards`, som gavekortet bruger. Den køres én gang, via
browseren — ingen Node nødvendig. Scriptet er idempotent (`CREATE TABLE IF NOT
EXISTS`), så det gør ingen skade at køre igen.

## Find SQL'en, der skal køres

Åbn `migrations/004_gift_cards.sql` i GitHub (eller her i editoren) og kopiér
HELE filens indhold. Det er det, du indsætter nedenfor.

## Vej A — Vercel-dashboardet (anbefalet)

1. Gå til <https://vercel.com> → log ind → vælg projektet **Bakkenshvile**.
2. Klik fanen **Storage**.
3. Åbn Postgres-databasen (den, der leverer `POSTGRES_URL`).
4. Vælg fanen **Query** (SQL-editor).
5. Indsæt hele indholdet af `004_gift_cards.sql`.
6. Klik **Run**. Der skulle stå noget i retning af "CREATE TABLE" / "CREATE
   INDEX" uden fejl.

## Vej B — Neon-konsollen (hvis databasen ligger i Neon)

1. Gå til <https://console.neon.tech> → log ind → vælg projektet.
2. Åbn **SQL Editor** i venstremenuen.
3. Vælg den rigtige database/branch (produktionen) øverst.
4. Indsæt hele indholdet af `004_gift_cards.sql`.
5. Klik **Run**.

## Bekræft, at det virkede

Kør denne i samme SQL-editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'gift_cards';
```

Får du én række med `gift_cards` tilbage, er tabellen oprettet, og gavekort-
funktionen kan bruge den. (Selve gavekort-flowet går stadig først live, når
Viva-kilden og live-flagene er sat — se `docs/viva-opsaetning.md`.)
