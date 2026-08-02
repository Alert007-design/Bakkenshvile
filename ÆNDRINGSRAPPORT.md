# Ændringsrapport — Bakkens Hvile

Gennemgang og opdatering af hele projektet for bakkenshvile.vercel.app. Sidens
design, visuelle identitet og stemning er bevaret. Alle ændringer er lavet på
branch `claude/bakkenshvile-viva-secure-login-alysn9`, så den nuværende version
kan gendannes.

**Ingen hemmeligheder er committet** — adgangskoder, Viva-nøgler, tokens og
webhook-hemmeligheder sættes udelukkende som miljøvariabler i Vercel.

---

## 1. Hvad der er ændret

**Fælles, sikkert personale-login (afsnit 1 + 11)**
- Al adgang via `?key=` er fjernet fra `/admin`, `/admin/qr` og `/admin/fribillet`.
  Adgangskoder fremgår ikke længere af URL, HTML eller klientkode.
- Ét fælles login (`STAFF_PASSWORD`) beskytter nu `/bar`, `/admin`, `/admin/qr`,
  `/admin/fribillet` og den nye `/funktioner` — samt de interne API-ruter.
- Efter login sættes en kortvarig, signeret session-cookie (`HttpOnly`,
  `Secure`, `SameSite=Strict`, HMAC, 8 timers levetid). Muterende kald beskyttes
  med CSRF-token.
- `middleware.ts` er det centrale værn (Edge, Web Crypto): uden gyldig session
  omdirigeres sidekald til `/login`, og API-kald besvares med 401. De enkelte
  ruter verificerer desuden sessionen serverside (defense-in-depth).
- Login er ratebegrænset med midlertidig spærring (6 forsøg/min. + spærring ved
  20 forsøg/15 min.). Neutral fejlbesked ved forkert login.
- Udlogning via `/funktioner` (og `/api/auth/logout`). Udløbet session sender
  brugeren tilbage til `/login`.
- Alle interne sider har `noindex, nofollow` (også via `X-Robots-Tag` fra
  middleware).
- **Ny side `/funktioner`**: samlet indgang for personalet med store, tydelige
  funktionskort, statusmærker (Aktiv / Under test / Ikke aktiveret / Afventer
  Viva-liveopsætning / Afventer lovlig kasseløsning), log ud-knap og `noindex`.

**Stripe fjernet, Viva som eneste udbyder (afsnit 2)** — se punkt 3 og 4.

**Korrekt betalingsbekræftelse (afsnit 3)**
- `/success` viser aldrig "Betaling gennemført", medmindre betalingen er
  verificeret serverside hos Viva (transaktion hentes, orderCode + status +
  beløb + valuta kontrolleres mod den oprindelige ordre i billet-ledgeren).
  Ellers vises »Vi kunne ikke bekræfte betalingen.«
- Siden er ren læsning: en genindlæsning opretter/behandler aldrig ordren igen
  (fulfillment sker i webhooken). `noindex`. Stripe-begreber (`session_id`,
  `checkout_session`) er væk.

**QR-bordbestilling (afsnit 4)**
- Flowet var i forvejen bygget (unikt, roterbart bordtoken; salstilstand;
  serverside pris-/tilgængelighedsvalidering; idempotent Viva-webhook; barens
  arbejdsskærm; gæstens status via sikkert `publicToken`; ratebegrænsning).
  Stripe-fallback-koden er fjernet, så flowet nu er rent Viva.
- Den offentlige omtale af QR-bestilling på forsiden og drikkekortet vises nu
  **kun**, når funktionen reelt er aktiveret (`TABLE_ORDERING_ENABLED`).

**Juridisk og indhold (afsnit 5–9)** — privatlivspolitik, handelsbetingelser,
moms, kontaktoverskrift og sproglige rettelser. Se detaljer nedenfor.

**Tekniske og brugervenlige forbedringer (afsnit 10)** — a11y, formularer,
metadata, ratebegrænsning m.m. Se detaljer nedenfor.

---

## 2. Berørte filer og miljøvariabler

### Nye filer
- `lib/staff-auth.ts` — fælles session/adgangskode/CSRF.
- `lib/staff-auth.test.ts` — tests (inkl. at Edge- og Node-token-format er enige).
- `middleware.ts` — centralt adgangsværn + `noindex`-header.
- `app/login/page.tsx`, `app/login/LoginClient.tsx`, `app/login/login.css` — fælles login.
- `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts` — login/logout.
- `app/funktioner/page.tsx`, `app/funktioner/funktioner.css` — samlet funktionsside.
- `ÆNDRINGSRAPPORT.md` — denne rapport.

### Slettede filer (Stripe)
- `lib/stripe.ts`, `lib/payments/stripe.ts`, `lib/table-webhook.ts`,
  `lib/table-webhook.test.ts`.
- `app/api/webhook/route.ts`, `app/api/table-orders/webhook/route.ts` (gamle
  Stripe-webhook-stubs).
- `lib/bar-auth.ts`, `lib/bar-auth.test.ts`, `app/api/bar/login/route.ts`,
  `app/bar/BarLogin.tsx` (erstattet af det fælles login).

### Væsentligt ændrede filer
- `lib/payments/index.ts`, `lib/payments/types.ts` — Viva som eneste udbyder.
- `lib/checkout.ts` — `StripeLineInput`/`stripeLines`/`stripeLinesTotalOre`
  omdøbt til `PaymentLineInput`/`paymentLines`/`paymentLinesTotalOre`.
- `lib/table-ordering-config.ts` — fjernet Stripe `sk_live_`-værn.
- `app/api/table-orders/checkout/route.ts` — kun Viva-grenen tilbage.
- `app/api/table-orders/viva/webhook/route.ts` — ryddet for `PAYMENT_PROVIDER`-gate.
- `app/success/page.tsx` — serververificeret bekræftelse.
- `app/page.tsx`, `app/priser/page.tsx` — QR-omtale gated på feature-flag +
  sproglige rettelser + `og:image`/metadata.
- `app/layout.tsx` — `og:image` + `metadataBase`.
- `lib/legal-content.ts` — moms, aflysning/refusion, bankoverførsel fjernet,
  Stripe→Viva, udvidede datakategorier, EU/EØS-overførsel, ensrettet opbevaringsfrist.
- `app/components/BookingClient.tsx`, `app/components/GenbestilClient.tsx` —
  formularer (required, `type`, `autocomplete`), `disabled` på udsolgt, moms,
  adresse/postnr. fjernet, e-mail-stavning.
- `app/api/checkout/route.ts` — adresse/postnr. fjernet fra billetkøb.
- `app/api/genbestil/lookup/route.ts` — ratebegrænsning.
- `app/admin/*`, `app/bar/*`, `app/api/admin/*`, `app/api/bar/*` — skiftet til
  det fælles login + CSRF.
- `lib/ticket-email.ts`, `lib/order-email.ts` — momsformulering på kvitteringer.
- `package.json` / `package-lock.json` — `stripe`-afhængighed fjernet.
- `env.example`, `README.md`, `docs/*` — opdateret til Viva + fælles login.

### Miljøvariabler
**Nye:** `STAFF_PASSWORD`, `STAFF_SESSION_SECRET`.

**Fjernet (må slettes i Vercel):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_TABLE_WEBHOOK_SECRET`, `ADMIN_KEY`, `BAR_SCREEN_PASSWORD`,
`BAR_SESSION_SECRET`, `PAYMENT_PROVIDER` (Viva er nu hårdkodet som eneste udbyder).

**Uændrede/Viva (skal sættes — se punkt 7):** `VIVA_ENV`, `VIVA_CLIENT_ID`,
`VIVA_CLIENT_SECRET`, `VIVA_MERCHANT_ID`, `VIVA_API_KEY`, `VIVA_WEBHOOK_TOKEN`,
`VIVA_SOURCE_CODE_TICKETS`, `VIVA_SOURCE_CODE_TABLE`, `VIVA_SOURCE_CODE`,
`TICKETS_LIVE`, `TABLE_ORDERING_ENABLED`, `TABLE_ORDERING_LIVE`,
`TABLE_QR_SECRET`, `TABLE_TOKEN_VERSION`, `AIRTABLE_*`, `RESEND_API_KEY`,
`EMAIL_FROM`, `SITE_URL`, `CRON_SECRET`, `POSTGRES_*`.

---

## 3. Fjernede Stripe-elementer

- Pakken `stripe` fjernet fra `package.json` og lockfilen (ikke længere i
  `node_modules`).
- Stripe-klient (`lib/stripe.ts`) og Stripe-provideren (`lib/payments/stripe.ts`).
- Stripe-webhook-handler (`lib/table-webhook.ts` + test) og de to gamle
  Stripe-webhook-ruter.
- Stripe-grenen i udbydervalget og i bordbestillingens checkout; Stripe
  `sk_live_`-værnet.
- Stripe-navngivne typer/felter i checkout-laget (omdøbt, ikke bare erstattet).
- Stripe-miljøvariabler og `session_id`/`checkout_session` på `/success` og
  bord-kvitteringen.
- Brugerrettet Stripe-tekst i handelsbetingelser og privatlivspolitik (→ Viva).
- Stripe-omtale i README opdateret; interne designdokumenter har fået en tydelig
  note om, at Stripe er udfaset (historiske Stripe-omtaler i
  `docs/projektbeskrivelse.md` er markeret som forældede).

Migrationerne (`migrations/00*.sql`) beholder historisk `stripe_*`-kolonner og
CHECK-constraint — de er allerede kørt og redigeres ikke. De provider-agnostiske
kolonner (`payment_provider`, `payment_ref`) bruges af Viva.

---

## 4. Sådan er Viva-integrationen opbygget

- **Lag:** `lib/payments/viva-client.ts` (rå HTTP mod Viva — OAuth2-token,
  opret ordre, hent transaktion, webhook-nøgle) → `lib/payments/viva.ts`
  (oversætter mellem vores ordre-verden i øre og Vivas kroner/ISO-valuta) →
  `lib/payments/index.ts` (udbydervalg + live-værn).
- **Beløb altid serverside:** browseren sender kun valgte varer/antal. Priser,
  moms, total, valuta, ordrenummer og varelinjer beregnes/valideres serverside
  (`lib/ticket-checkout.ts`, `lib/checkout.ts`, `lib/money.ts`).
- **Oprettelse:** ordren oprettes som kladde FØR betalingen, så dens interne id
  ligger i Vivas `merchantTrns`/`tags`. Vivas 16-cifrede `orderCode` bruges som
  betalingsreference (læses som streng, aldrig som JS-tal).
- **Verifikation:** en betaling markeres først som gennemført, når transaktionen
  er hentet hos Viva og status = "F" (Finished), og beløb + valuta + reference
  matcher den oprindelige ordre. Payloaden fra webhooken bruges aldrig som
  kilde til beløb/status.
- **Webhook:** `app/api/table-orders/viva/webhook/route.ts` er Vivas fælles
  endpoint. GET besvarer Vivas verifikations-handshake; POST dirigerer på vores
  egen reference (orderCode) mod billet-ledgeren hhv. bordordrer. Adgang
  beskyttes med delt hemmelighed i `?k=` (`VIVA_WEBHOOK_TOKEN`, timing-safe).
- **Idempotens:** `pending → paid` udføres præcis én gang (guardet SQL-UPDATE +
  unik constraint på `(payment_provider, payment_ref)`). Beløb-mismatch → ingen
  ændring. 500 → Viva prøver igen (sikkert, da behandlingen er idempotent).
- **Live-værn (fail-closed):** `VIVA_ENV=live` kræver `TICKETS_LIVE=true` for
  billetter og `TABLE_ORDERING_LIVE=true` for bordbestilling — ellers kastes der.
- **Ingen kortdata gemmes:** kortoplysninger indtastes hos Viva; vi gemmer kun
  reference og status. Token-svar og fulde betalingsoplysninger logges aldrig.

---

## 5. Kørte tests

- `npx tsc --noEmit` — typecheck: **grøn**.
- `npm test` (vitest) — **183 tests grønne** efter tilpasning af de tests, der
  antog Stripe (udbydernavn, `stripeLines`, `sk_live_`-værn). Ny test
  `lib/staff-auth.test.ts` dækker session, adgangskode, CSRF, udløb og at Edge-
  og Node-token-formatet er identisk.
- `npm run build` — **grøn**; middleware og alle ruter kompilerer. `/api/webhook`,
  `/api/table-orders/webhook` og `/api/bar/login` er væk; `/api/auth/login`,
  `/api/auth/logout`, `/login` og `/funktioner` er til stede.

**Manuelt anbefalet før go-live** (kræver kørende Vercel + Viva-testkonto):
sider uden/med forkert/korrekt login og efter udløbet session; billetflow i
Vivas testmiljø (godkendt/afvist/afbrudt/ubekræftet); QR-flow med ≥2 borde; at
ordrer ikke kan flyttes mellem borde via URL/request; at interne API-ruter
afvises uden session; at salen lukket afviser bestilling; at `/success` ikke
viser gennemført uden serververificeret Viva-betaling; at samme webhook kan
modtages flere gange uden dobbeltbehandling; mobilvisning ved gængse bredder.

---

## 6. Hvad der fortsat kræver manuel Viva-opsætning

- Oprette/bekræfte Viva-konto og hente OAuth2 client credentials samt
  merchant-id/API-nøgle.
- Oprette **payment sources** i Viva (én til billetter, én til bordbestilling)
  med de korrekte success-/failure-URL'er og indsætte deres source-koder.
- Oprette **webhooken** i Viva mod
  `/api/table-orders/viva/webhook?k=<VIVA_WEBHOOK_TOKEN>` og gennemføre Vivas
  verifikations-handshake.
- Bekræfte de præcise **korttyper/betalingsmetoder**, kontoen accepterer, og
  skrive dem ind i handelsbetingelserne (markeret med "Afventer juridisk
  gennemgang" i `lib/legal-content.ts`).
- Bekræfte **overførselsgrundlag** (EU/EØS) og øvrige databehandlingsforhold i
  privatlivspolitikken (ligeledes markeret).
- Udfylde manglende virksomhedsoplysninger (fx telefonnummer) i
  `lib/legal-content.ts` (`COMPANY.phone`).

---

## 7. Oplysninger/nøgler der skal hentes fra Viva

Sæt følgende i Vercel (server-only, aldrig `NEXT_PUBLIC_*`):

| Variabel | Hvor i Viva |
|---|---|
| `VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET` | Settings → API access (Smart Checkout OAuth2 client credentials) |
| `VIVA_MERCHANT_ID`, `VIVA_API_KEY` | Settings → API access (bruges kun til webhook-verifikationsnøglen) |
| `VIVA_SOURCE_CODE_TICKETS`, `VIVA_SOURCE_CODE_TABLE` | Sales → Payment sources (source-koden for hver source) |
| `VIVA_WEBHOOK_TOKEN` | Selvvalgt, lang tilfældig streng — indgår i webhook-URL'ens `?k=` |
| `VIVA_ENV` | `demo` under test, `live` i produktion |

Bemærk: variabelnavnene er ikke opfundet — de matcher den eksisterende
Viva-integration i koden. Kontotype er Viva.com **Smart Checkout**
(demo-/live-hostene i `lib/payments/viva-client.ts`).

---

## 8. Hvad der skal være på plads før QR-bestilling og livebetaling aktiveres

1. Viva-liveopsætning færdig (konto, sources, webhook, korttyper bekræftet).
2. En **lovlig kasseløsning / salgsregistrering** på plads
   (`lib/sales-registration.ts` er forberedt, men live kræver konfiguration).
3. Feature-flag: `TABLE_ORDERING_ENABLED=true` (funktionen) og
   `TABLE_ORDERING_LIVE=true` (livebetaling for bord).
4. Billet-live: `TICKETS_LIVE=true`.
5. `VIVA_ENV=live` sat FØRST når 1–4 er opfyldt (fail-closed-værnet kaster
   ellers). QR-omtalen på forsiden/drikkekortet tændes automatisk med
   `TABLE_ORDERING_ENABLED`.

---

## 9. Sådan skiftes sikkert mellem Vivas test- og livemiljø

- `VIVA_ENV=demo` bruger Vivas demo-hoste; `VIVA_ENV=live` bruger live-hostene
  (`lib/payments/viva-client.ts`). Skift kun ét sted.
- Test- og live-**credentials må aldrig blandes**: brug demo-client/secret/
  sources med `demo`, og live-client/secret/sources med `live`. Skift begge dele
  samtidig.
- Fail-closed: `VIVA_ENV=live` uden `TICKETS_LIVE`/`TABLE_ORDERING_LIVE` giver
  bevidst fejl, så en halv opsætning aldrig kan trække rigtige penge.
- Skift tilbage til `demo` for at teste igen — ingen kodeændring nødvendig.

---

## 10. Sådan afstemmes en betaling mellem Viva og den interne ordreoversigt

- Hver ordre har en **entydig intern identifikation** (bookingnummer / `BH-B-…`
  ordrenummer og databasens `id`) og Vivas `orderCode` (gemt som `payment_ref`).
  Vores id sendes desuden med som `merchantTrns` og `tags`, så det kan læses
  tilbage fra en verificeret transaktion.
- Betalingsstatus kan altid genhentes hos Viva ud fra `orderCode`/transaktions-id
  og sammenholdes med `payment_status`, beløb og valuta i databasen.
- Skulle forbindelsen mellem Viva og sitet afbrydes, efterlades intet
  inkonsistent: ordren markeres kun betalt efter serververifikation, og Vivas
  webhook-genforsøg (idempotente) samler op. En betalt betaling kan altid
  genkendes på `orderCode`, og en manuel afstemning kan ske ved at slå
  `orderCode` op begge steder.
