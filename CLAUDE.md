# Regler for Claude Code i dette repo

## Hvem du arbejder for
- Ejeren er ikke udvikler og kan ikke læse kode. Skriv altid dansk og uden
  fagsprog. Bruger du et fagord, så forklar det i samme sætning.
- Ejeren arbejder i browseren: GitHub, Vercel, Supabase SQL Editor, Airtable,
  Resend og API-leverandørernes konsoller. Alt, ejeren selv skal gøre, skrives
  som klikvejledning: menu, fane, knap, i rækkefølge. Foreslå ikke
  terminalkommandoer til ejeren.
- Skeln altid tydeligt mellem det, du har verificeret (kørt, testet, læst i
  koden), og det, du antager. Skriv "verificeret" eller "antagelse".
- Skriver ejeren "Stop", så stop øjeblikkeligt, forklar hvad der er sket, og
  hvordan det rulles tilbage.

## Fast arbejdsgang ved større funktioner: Plan → Tests → Byg → Pull request
1. Plan først. Ret ingen filer, før ejeren har godkendt planen. Planen siger:
   hvilke filer ændres, i hvilken rækkefølge, hvad kan gå galt, og om det rører
   betaling, persondata, database, cron eller udsendelse af mails.
2. Tests først. Skriv automatiske tests, inkl. fejlsituationer, som fejler nu.
   Byg derefter funktionen, indtil de består.
3. Kør alle tests og et lokalt build, før du melder færdig. Kan noget ikke
   testes lokalt, så sig det ligeud. Skriv aldrig "virker" om noget, du ikke
   har kørt.
4. Én funktion ad gangen, én gren og ét pull request pr. funktion. Ved
   opgaver i flere trin: stop efter hvert trin og vent på, at ejeren har flettet.
Små rettelser (stavefejl, en enkelt tekst) kræver ikke plan og tests, men
stadig gren og pull request.

## Git
- Commit aldrig direkte til main, og push aldrig til main.
- GitHub CLI er ikke tilgængelig. Opret ikke pull request selv. Giv ejeren det
  direkte link til at oprette den på github.com.
- Midlertidige testscripts og forsøgsfiler slettes, før du committer. Afslut
  altid med git status, og skift tilbage til main.
- Ret kun de filer, opgaven handler om. Ser du andre fejl, så nævn dem, men
  ret dem ikke uopfordret.

## Kræver udtrykkelig godkendelse af HVER ændring (også ved auto-accept)
- Betaling (Viva, Stripe) og alt, der rører priser eller abonnementer.
- Persondata: abonnenter, kunder, e-mailadresser, Facebook-brugere, logfiler
  med personoplysninger.
- Automatiske svar eller opslag på Facebook og andre sociale medier.
- Databasemigrationer og enhver ændring af tabeller eller felter.
- Cron-jobs, miljøvariabler og login-/adgangskode.
- Alt, der kan sende mail til rigtige modtagere.

## Må aldrig ske
- Kør aldrig destruktive databasekommandoer (drop schema, drop table, truncate,
  delete uden where). Er en sådan nødvendig, så skriv SQL'en til ejeren med en
  tydelig advarsel og en påmindelse om at eksportere data først. Ejeren kører
  den selv.
- Skriv aldrig nøgler, adgangskoder eller tokens i repoet, i commits, i logs
  eller i chatten. Hemmeligheder hører hjemme i Vercels miljøvariabler.
- Opret ikke nye betalte tjenester, og foreslå ikke opgraderinger, medmindre
  ejeren beder om det. Foreslå aldrig automatisk genopfyldning af saldo hos en
  API-leverandør. Den forudbetalte saldo er loftet over forbruget.
- Omgå aldrig adgangsbegrænsninger: robots.txt, ai.txt, login-krav,
  betalingsmure eller en tjenestes vilkår. Gæt ikke feed- eller API-adresser;
  verificér dem med et rigtigt kald.
- Byg ikke login eller adgangsstyring om uden en udtrykkelig opgave om det.

## Drift og omkostninger
- Projekterne kører på Vercel Pro. Tilføj eller ændr aldrig cron-jobs eller
  kørselstid (maxDuration) uden ejerens udtrykkelige godkendelse, og sig altid,
  hvad ændringen ca. betyder for forbruget hos Vercel og hos AI-leverandørerne.
- Hvert kald til en AI- eller billed-API koster penge. Tilføj ikke nye kald,
  løkker eller genforsøg uden at sige, hvad det ca. betyder for forbruget.
- Fejl må ikke sluges i stilhed. Fejl i planlagte jobs skal kunne ses af
  ejeren på projektets status-/adminside.

## Dokumentationsopslag (Context7)
- Er MCP-serveren Context7 tilgængelig, så brug den til at slå aktuel
  dokumentation op, før du skriver eller retter kode mod et bibliotek eller en
  ekstern API (Next.js, Supabase, Vercel, Resend, Airtable, Anthropic, OpenAI
  m.fl.). Stol ikke på hukommelsen for API-detaljer og versionsforskelle.
- Send aldrig nøgler, persondata eller projektets egne data med i et opslag.
- Er Context7 ikke tilgængelig, så sig det, og brug den officielle
  dokumentation i stedet.

## Sådan afslutter du en opgave
Skriv en kort opsummering på dansk med disse punkter:
1. Hvad der er ændret, og hvilke filer.
2. Hvad der er testet og hvordan, og hvad der IKKE kunne testes.
3. Hvad ejeren skal gøre i browseren, som klikvejledning: pull request, nye
   miljøvariabler i Vercel, SQL der skal køres i Supabase SQL Editor, felter i
   Airtable.
4. Hvordan ændringen rulles tilbage.

# Om dette projekt

**Hvad det er:** Ét Next.js-site for Bakkens Hvile på Dyrehavsbakken. Forside,
billetkøb (`/book`), genbestilling (`/genbestil`), gavekort (`/gavekort`),
QR-bordbestilling (`/bord/[nummer]`) og interne personalesider (`/funktioner`,
`/bar`, `/admin`, `/admin/qr`, `/admin/fribillet`) bag ét fælles login i
`middleware.ts`.

**Adresse:** kører i dag på `bakkenshvile.vercel.app` (standardværdien for
`SITE_URL` i `lib/site-url.ts`). Kommende domæne er `bakkenshvile.dk`. Det gamle
`www.bakkenshvile.dk` må aldrig sættes som `SITE_URL` — så peger QR-koderne
forkert.

**Teknologi:** Next.js 14 (App Router), React 18, TypeScript. Tests i Vitest
(`npm test`). Betaling udelukkende via Viva.com Smart Checkout; Stripe er
udfaset og ligger som død kode. Mail sendes via Resend.

**Hvor data ligger:** to steder. Airtable rummer forestillinger, billettyper,
tilvalg, kunder og bookinger. En Postgres-database rummer `hall_state`,
`orders`, `order_lines`, `ticket_payments` og `gift_cards`. Postgres tilgås med
`@vercel/postgres` via `POSTGRES_URL`; databasen ligger hos **Neon** gennem
Vercels Storage-integration — ikke Supabase. Når reglerne ovenfor nævner
"Supabase SQL Editor", er det Neons Query-fane i Vercel, der menes her.

**Migrationer** køres ikke automatisk. Ejeren kører dem selv i databasens
Query-fane i nummerorden. Alle fire i `migrations/` (001–004) er kørt mod
produktionsdatabasen, verificeret 15-09-2026. Fremgangsmåde med klikvejledning:
`docs/koer-migration-004.md`.

**Cron:** `vercel.json` indeholder præcis ét job — `/api/cron/varsel` med
`0 8 * * *` (08:00 UTC, varselmail to dage før show). Ruten sætter
`maxDuration = 60`. Tilføj aldrig flere jobs uden ejerens godkendelse.

**Miljøvariabler** (kun navne; fuld kommenteret liste i `env.example`):
`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `RESEND_API_KEY`, `EMAIL_FROM`,
`STAFF_PASSWORD`, `STAFF_SESSION_SECRET`, `CRON_SECRET`, `SITE_URL`,
`TABLE_QR_SECRET`, `TABLE_TOKEN_VERSION`, `VIVA_ENV`, `VIVA_CLIENT_ID`,
`VIVA_CLIENT_SECRET`, `VIVA_MERCHANT_ID`, `VIVA_API_KEY`, `VIVA_WEBHOOK_TOKEN`,
`VIVA_SOURCE_CODE_TICKETS`, `VIVA_SOURCE_CODE_GAVEKORT`,
`VIVA_SOURCE_CODE_TABLE`, `VIVA_SOURCE_CODE`, `TICKETS_LIVE`, `GAVEKORT_LIVE`,
`TABLE_ORDERING_ENABLED`, `TABLE_ORDERING_LIVE`, `SALES_REGISTRATION`,
`POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`.

**Livebetaling er spærret pr. flow** (fejler lukket). `VIVA_ENV=live` kræver
`TICKETS_LIVE=true` for billetter, `GAVEKORT_LIVE=true` for gavekort og
`TABLE_ORDERING_LIVE=true` for bordbestilling. De tre er uafhængige. Viva-
webhooken er ét fælles endpoint for alle flows og må ikke duplikeres.

**Forældet dokumentation — stol ikke på disse steder:**
- `README.md` nævner ikke gavekortet i sidelisten, mangler `GAVEKORT_LIVE` i
  afsnittet om live-spærring, og skriver stadig, at livebetaling af
  bordbestilling kræver "en lovlig kasseløsning". Det krav er fjernet.
- `docs/go-live-tjekliste.md` punkt 7 siger, at der ikke findes en
  gavekortfunktion. Den findes. Punkt 5 om biografier er delvist udført.
- `docs/projektbeskrivelse.md` beskriver Stripe og `PAYMENT_PROVIDER`
  historisk; de gælder ikke længere.
- UBEKRÆFTET: Vercel-planen (Pro) og `bakkenshvile.dk` som live-domæne kan ikke
  verificeres i repoet.

Modsiger dokumentationen denne fil, gælder denne fil.
