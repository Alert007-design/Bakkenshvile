# Bakkens Hvile — samlet projektbeskrivelse

> Dette dokument er en samlet, selvstændig beskrivelse af Bakkens Hviles nye
> hjemmeside. Det er skrevet, så det kan lægges direkte ind i et projekt (fx et
> Claude-projekt) som fælles kontekst. Det beskriver *hvad* sitet er, *hvad* det
> gør, *hvordan* det er bygget, og *hvilke* regler og sikkerhedskontakter der
> gælder — uden at man behøver læse koden først.

---

## 1. Kort fortalt

**Bakkens Hvile** er scenen for bakkesangerinderne på Dyrehavsbakken i
Klampenborg — snart 150 år med skønsang og syngende samfundssatire. Sitet er
husets samlede digitale platform: marketing-forside, online billetkøb,
drikkekort, QR-bordbestilling i salen, en arbejdsskærm til baren, samt
admin-værktøjer til bordplan og QR-print.

Det hele er **ét Next.js-site**, der deployes på **Vercel**. Data ligger dels i
**Airtable** (events, billetter, tilvalg/menu, kunder, bookinger), dels i en
**Vercel Postgres**-database (den transaktionelle bordbestilling). Betalinger
går gennem **Stripe Checkout**, og mails sendes via **Resend**.

- Produktion: `https://bakkenshvile.vercel.app` (domæne `bakkenshvile.dk`)
- Repo: `Alert007-design/bakkenshvile`
- Sprog i UI og kode: **dansk**

---

## 2. Hvem bruger sitet

| Rolle | Bruger til |
|-------|-----------|
| **Gæst (før showet)** | Læser om huset, køber billetter + tilvalg online, booker syngepigerne til private fester |
| **Gæst (i salen)** | Scanner QR ved bordet og bestiller drikkevarer, ser kvittering og leveringsstatus |
| **Gæst (efter køb)** | Genbestiller flere tilvalg til en eksisterende booking indtil kl. 12 på showdagen |
| **Baren (personale)** | Arbejdsskærm der viser og afvikler indkomne bordbestillinger, styrer salens tilstand |
| **Kontoret (admin)** | Laver bordplan til udsolgte shows, printer QR-ark til bordene |

---

## 3. Sidekort (ruter)

### Offentlige / gæstevendte sider
- **`/`** — Forsiden. Marketing-design i sort/guld: hero, om os, sæsonens
  sangerinder, priser-teaser, billedgalleri, kontaktformular til booking af
  syngepigerne, kontakt/åbningstider. Alle "Køb billetter"-knapper peger internt
  på `/book`.
- **`/book`** — Billetkøbsflowet. Henter aktuelt event, billettyper og tilvalg
  fra Airtable, lader gæsten vælge antal + tilvalg, viser løbende total og sender
  til Stripe.
- **`/priser`** — Hele drikkekortet, læst fra Airtable (AddOns). Viser fulde
  salpriser; online-køb giver 10 % rabat.
- **`/success`** — Bekræftelsesside efter gennemført billetbetaling.
- **`/genbestil`** — Genbestilling af flere tilvalg til en eksisterende booking
  (login med ref+nøgle eller bookingnr+email).
- **`/bord/[nummer]`** — QR-gæstesiden. Åbnes ved at scanne bordets QR-kode.
  Viser menuen og lader gæsten bestille til netop det bord.
- **`/bord/[nummer]/kvittering`** — Gæstens kvittering + leveringsstatus for en
  bordbestilling.
- **`/bord/kvittering`** — Vivas fælles success-URL. Finder ordren via cookien
  `bh_bord_ordre` og videresender til `/bord/[nummer]/kvittering`.
- **`/bord/afbrudt`** — Vivas fælles failure-URL (afbrudt/afvist betaling).

### Personale / admin
- **`/bar`** — Barens arbejdsskærm. Bag adgangskode. Viser aktive
  bordbestillinger, lader baren flytte dem gennem leveringsstatus og styre
  salens tilstand (åben/lukket bestilling m.m.).
- **`/admin`** — Bordplan til udsolgte shows. Bag en simpel `?key=`-nøgle.
- **`/admin/qr`** — Printbart QR-ark med én kode pr. bord.

### API-ruter
- `POST /api/checkout` — opretter Stripe-session for billetkøb.
- `POST /api/webhook` — Stripe-webhook for billetter (`checkout.session.completed`).
- `GET /api/orders/[publicToken]` — gæstens egen bordordre (via hemmeligt token).
- `POST /api/table-orders/checkout` — opretter bordbestilling + betaling hos den
  valgte udbyder (Stripe eller Viva).
- `POST /api/table-orders/webhook` — Stripe-webhook for bordbestilling (separat
  secret; aktiv når `PAYMENT_PROVIDER=stripe`).
- `GET/POST /api/table-orders/viva/webhook` — Viva-webhook for bordbestilling
  (GET = verifikations-handshake, POST = event; aktiv når `PAYMENT_PROVIDER=viva`).
- `POST /api/bar/login` — barlogin, sætter signeret session-cookie.
- `GET/POST /api/bar/orders`, `POST /api/bar/orders/[id]/status` — barens ordreliste og statusskift.
- `GET/POST /api/bar/hall-state` — salens tilstand.
- `GET/POST /api/admin/bookings` — bookinger til bordplanen.
- `POST /api/genbestil/lookup`, `POST /api/genbestil/checkout` — genbestilling.
- `GET /api/cron/varsel` — daglig cron, sender varselmail to dage før show.

---

## 4. To hovedflows

### 4.1 Billetkøb (Airtable + Stripe)
1. `/book` henter det først oprettede, aktive event fra Airtable med tilhørende
   billettyper (pris, gebyr, max antal, priskategori) og tilvalg (drikkevarer).
2. Gæsten vælger antal billetter (op til max pr. kategori) og evt. tilvalg. En
   løbende total vises nederst. Ved købet kan gæsten frivilligt svare på et par
   spørgsmål (alder, hjemby, drikkepræference, interesser, fritekst) til brug
   for bordsammensætning.
3. Ved "Gå til betaling" oprettes en **Customer**- og **Booking**-post i
   Airtable med status *"Afventer betaling"*, og gæsten sendes til Stripe Checkout.
4. Stripe-webhooken (`checkout.session.completed`) opdaterer bookingens status
   til *"Betalt"*, og gæsten lander på `/success`.

### 4.2 QR-bordbestilling (Postgres + Viva/Stripe)
1. Hvert bord har et fysisk QR-skilt, der peger på `/bord/[nummer]?k=<token>`.
2. Gæsten scanner, ser menuen (samme AddOns-liste som billettilvalgene) og
   bestiller. Browseren sender **kun** `menuItemId + antal` (plus bord, token,
   navn, besked, leveringsfase) — **aldrig** priser.
3. Serveren genberegner alle beløb ud fra menuen, validerer token + at
   bestilling er åben, opretter en **ordrekladde** i Postgres og en betaling hos
   den valgte udbyder.
4. **Udbyder-abstraktion:** Stripe og Viva ligger begge bag ét fælles interface
   (`lib/payments/`), og `PAYMENT_PROVIDER` (`stripe` | `viva`) vælger hvem der
   bruges. Der kan skiftes tilbage til Stripe med én miljøvariabel. Bordbestillingen
   kører pt. **Viva.com Smart Checkout** (demo); billetkøbet er uændret på Stripe.
5. Ved Viva sendes gæsten til Vivas checkout (`?ref={orderCode}`). Vivas success-
   og failure-URL er fælles for alle betalinger (sat i Vivas dashboard):
   `/bord/kvittering` og `/bord/afbrudt`. Da success-URL'en ikke kan bære gæstens
   hemmelige token, sætter checkout en `httpOnly`-cookie (`bh_bord_ordre`), som
   `/bord/kvittering` bruger til at videresende til den rigtige kvitteringsside.
6. Webhooken markerer ordren betalt (idempotent). **Viva signerer ikke sine
   webhooks**, så payloadens beløb/status bruges aldrig — transaktionen hentes
   altid hos Viva, og beløb + valuta kontrolleres mod kladden. Ordren dukker op på
   `/bar`, hvor baren afvikler den gennem leveringsstatus. Gæsten kan følge sin
   ordre på kvitteringssiden via et hemmeligt `public_token`.

---

## 5. Priser og rabat (én kilde)

- **Alle priser vedligeholdes ét sted**: AddOns-tabellen i Airtable. Både
  drikkekortet (`/priser`), billettilvalgene og QR-menuen læser derfra.
- **Onlinerabat: 10 % på drikkevarer** ved online-køb (billet-tilvalg *eller* QR).
  Rabatten gælder **kun tilvalg** — aldrig billetpriser og aldrig gebyrer.
- Rabatten beregnes **pr. enhed, rundet ned til hele kroner** (`Math.floor`), og
  totalen er summen af de enhedsrundede rabatter. Det garanterer, at det gæsten
  ser pr. linje er *præcis* det, der trækkes — både i frontend og i Stripe.
- Al prislogik ligger i `lib/pricing.ts` (kr- og øre-varianter) og deles af alle flows.

---

## 6. Datamodel

### Airtable (base "Bakkens Hvile")
Autoritativ for billet-verdenen. Tabeller:
- **Events** — forestillinger (titel, dato, tid, varighed, noter, priskategori,
  udsolgt-flag, link til bookinger).
- **TicketTypes** — billettyper (kategori, pris, gebyr, max antal, priskategori).
- **AddOns** — tilvalg/menu (navn, pris, kategori/gruppe, beskrivelse, aktiv,
  momssats, produktkode, sortering). **Fælles kilde** for billettilvalg,
  drikkekort og QR-menu.
- **Customers** — kunder (navn, firma, adresse, postnr., telefon, email).
- **Bookings** — bookinger (bookingnr, antal, status, show-relation,
  kunde-relation, bordnummer, matching-felter, tilvalg, rabat, betalt beløb,
  varsel-sendt m.m.).

Alle tabel- og felt-ID'er er samlet i `lib/airtable.ts` (`TABLES`, `FIELDS`).

### Postgres (Vercel) — bordbestillingen
**Autoritativ** kilde for QR-ordrer; Airtable er kun spejling/rapportering, aldrig
eneste værn mod dobbeltordrer. Skema i `migrations/001_table_orders.sql`:
- **`hall_state`** — salens tilstand pr. event (`before_show` / `show` /
  `interval` / `closed`) + `ordering_open`.
- **`orders`** — ordrer med `public_token` (gæsteopslag), pænt `order_number`
  (`BH-B-00001`), beløb i øre, `payment_status` (pending/paid/failed/refunded) og
  `fulfillment_status` (new/preparing/ready/delivered/cancelled). Udbyder-
  uafhængige betalingskolonner: `payment_provider` (`stripe` | `viva`),
  `payment_ref` (Stripes session-id eller Vivas orderCode) og `payment_txn_id`
  (transaktions-id). Unik constraint på **`(payment_provider, payment_ref)`** —
  **én betaling kan aldrig give to ordrer**. De gamle `stripe_checkout_session_id`
  / `stripe_payment_intent_id`-kolonner beholdes indtil videre (rollback). Skema i
  `migrations/001_table_orders.sql` + `migrations/002_payment_provider.sql`.
- **`order_lines`** — linjesnapshot (navn, produktkode, antal, enhedspris, moms,
  linjetotal) fastfrosset ved købet.

---

## 7. Salens borde og QR-tokens

- **Én borddefinition** i hele kodebasen: `lib/tables.ts`. Billetsystem,
  bordplan, QR-generator og bordbestilling bruger alle denne allowlist.
- Salen har **44 borde** i 10 rækker (rækkestørrelser `[5,5,5,5,5,5,4,4,4,2]`).
  Nummerering: første ciffer = række, sidste ciffer = plads talt fra baren og
  indad (baren ligger langs højre side). Bord 63 = 6. række, 3. bord fra baren.
- Priskategorier følger salplanen: række 1–6 = **A+**, række 7–9 = **A** (dog er
  bord 94 kategori **B**), række 10 = **B**.
- **QR-token**: hvert bord har en HMAC-SHA256-token over `"version:bordnummer"`
  med den server-only hemmelighed `TABLE_QR_SECRET` (`lib/table-tokens.ts`).
  Tokenet kan ikke gættes, kan ikke genbruges på et andet bord, og kan roteres
  ved at hæve `TABLE_TOKEN_VERSION` (default `2026`) og genudskrive QR-arkene.
- Et token alene giver **ikke** ret til at bestille: serveren kræver også et
  **aktivt event i åben bestillingsperiode**. Et fotograferet skilt virker derfor
  ikke hjemmefra.

---

## 8. Sikkerhed og korrekthed (vigtige garantier)

- **Priser genberegnes altid serverside** ud fra menuen; browserens prisdata
  ignoreres. Ukendte eller inaktive varer kan ikke købes.
- **Betalinger er idempotente**: `markOrderPaidByRef` udfører kun overgangen
  `pending → paid` én gang, verificerer beløb + valuta mod kladden, og er sikker
  ved samtidige webhook-kald (guardet `UPDATE ... WHERE payment_status='pending'`).
  Opslag sker på `(payment_provider, payment_ref)`, og den unikke constraint på
  samme par sikrer, at én betaling aldrig kan give to ordrer — uanset udbyder.
- **Udbyder-abstraktion** (`lib/payments/`): Stripe og Viva bag ét interface
  (`PaymentProvider`). Alle beløb i abstraktionslaget er i **øre**; kun den
  enkelte provider omregner (Vivas kroner-decimaltal ↔ øre, ét sted i
  `kronerToOre`). Valuta normaliseres (Vivas ISO-numeriske `208` → `"dkk"`).
- **Leveringsstatus** flyttes kun gennem gyldige overgange, med `SELECT FOR UPDATE`,
  så to medarbejdere ikke laver modstridende skift (`lib/orders.ts`,
  `lib/order-status.ts`).
- **Gæsteopslag** afslører kun ufølsomme felter for netop den ene ordre (via
  hemmeligt `public_token`) — aldrig andre gæsters data.
- **Barlogin** (`lib/bar-auth.ts`): adgangskode tjekkes kun serverside; ved login
  udstedes en signeret, HttpOnly/Secure/SameSite=Strict session-cookie (HMAC med
  `BAR_SESSION_SECRET`) uden selve koden. CSRF-værn via dobbelt-submit-token.
- **Genbestilling** (`lib/genbestil.ts`): login med timing-safe sammenligning,
  generisk fejl uanset årsag, formel-injektion-værn på bookingnr, og deadline
  kl. **12.00 dansk tid** på showdagen.
- **Airtable-robusthed** (`lib/airtable.ts`): klienten kalder aldrig Airtable
  direkte. Serverside cache med TTL + "stale-on-error", eksponentiel backoff på
  429/5xx (Airtable tillader kun 5 kald/sekund), og batchede skrivninger (max 10
  pr. kald).
- **Grænseværn** for bordbestilling (`lib/table-ordering-config.ts`): max 20 pr.
  vare, 40 varer i alt, 5.000 kr. pr. ordre; rate limit 8 forsøg/minut pr.
  IP+bordtoken; checkout-session udløber efter 30 min.

### Sikkerhedskontakter for livebetaling (bordbestilling)
Bordbestillingen er **under opbygning og ikke i drift endnu**. To flag styrer den:
- `TABLE_ORDERING_ENABLED` (default `false`) — intet tager imod bestillinger, før dette er `true`.
- `TABLE_ORDERING_LIVE` (default `false`) — ingen livebetaling, før dette er `true`
  **og** lovpligtig salgsregistrering er konfigureret.
- En **live** Stripe-nøgle (`sk_live_`) afvises hårdt, hvis `TABLE_ORDERING_LIVE`
  ikke er `true` (`assertLivePaymentAllowed`).
- Tilsvarende for Viva: `VIVA_ENV=live` afvises hårdt, hvis `TABLE_ORDERING_LIVE`
  ikke er `true` (`assertVivaLiveAllowed`, kaldes i `getPaymentProvider`, så den
  ikke kan omgås ved at importere provideren direkte).
- **Viva-webhooken** (`/api/table-orders/viva/webhook`): Viva **signerer ikke**
  sine webhooks, så payloadens beløb/status bruges aldrig — transaktionen hentes
  altid hos Viva og kontrolleres mod kladden (fail-closed). Adgang beskyttes med
  en delt hemmelighed i URL'ens `?k=` (timing-safe mod `VIVA_WEBHOOK_TOKEN`);
  ukendt nøgle → 404. Kun `EventTypeId 1798` (failed) og `1797` (reversal) samt
  transaktionsstatus `"F"` (paid) udløser en tilstandsændring — der gættes ikke
  på andre koder. Vivas 16-cifrede `orderCode` læses altid som **streng** (aldrig
  som JavaScript-tal, der ville miste præcision).
- **Lovpligtig digital salgsregistrering** (`lib/sales-registration.ts`):
  kassesystemet er endnu ikke afklaret. I testtilstand registreres salg som
  testdata (CSV, ikke godkendt produktion); i livetilstand **fejler modulet
  lukket**, indtil et lovligt system er koblet på. Ingen livebetaling må
  registreres "løst" og efterregistreres manuelt.

---

## 9. Teknik og opsætning

- **Stack**: Next.js 14 (App Router), React 18, TypeScript. Fonte: Playfair
  Display + Work Sans. Styling i global CSS med sort/guld-tema.
- **Test**: Vitest. Bordbestilling og pengelogik testes mod en indlejret Postgres
  (`@electric-sql/pglite`). Kør med `npm test`.
- **Integrationer**: Airtable (REST), Stripe (Checkout + webhooks — billetter og
  som valgbar udbyder for bordbestilling), **Viva.com Smart Checkout** (OAuth2 +
  Checkout v2 + webhooks — bordbestillingens aktuelle udbyder), Resend (mail),
  Vercel Postgres.
- **Cron**: Vercel-cron kalder `/api/cron/varsel` dagligt og sender varselmail to
  dage før et show (autoriseret med `CRON_SECRET`).
- **Mail**: afsenderdomæne `send.bakkenshvile.dk` (verificeret i Resend, region
  eu-west-1). From: `billetter@send.bakkenshvile.dk`, Reply-To:
  `kontor@bakkenshvile.dk`. DNS/DKIM/SPF/DMARC beskrevet i `docs/email-dns.md`.
- **QR-ark**: `npm run qr:sheet` genererer et printbart ark (kræver `TABLE_QR_SECRET`).

### Miljøvariabler (server-only)
`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_KEY`, `CRON_SECRET`, `SITE_URL`,
`TABLE_QR_SECRET`, `TABLE_TOKEN_VERSION`, `BAR_SCREEN_PASSWORD`,
`BAR_SESSION_SECRET`, `STRIPE_TABLE_WEBHOOK_SECRET`, `TABLE_ORDERING_ENABLED`,
`TABLE_ORDERING_LIVE`, `POSTGRES_URL(_NON_POOLING)`.
Betalingsudbyder for bordbestilling: `PAYMENT_PROVIDER` (`stripe` | `viva`) og —
for Viva — `VIVA_ENV` (`demo` | `live`), `VIVA_SOURCE_CODE`, `VIVA_CLIENT_ID`,
`VIVA_CLIENT_SECRET`, `VIVA_MERCHANT_ID`, `VIVA_API_KEY`, `VIVA_WEBHOOK_TOKEN`.
Ingen af bordbestillingens hemmeligheder må eksponeres via `NEXT_PUBLIC_*`.

### Deploy
Push til GitHub → Vercel bygger og deployer automatisk. Stripe-webhooks peger på
`/api/webhook` (billetter) og `/api/table-orders/webhook` (bordbestilling på
Stripe) med hver sin signing secret. Kører bordbestillingen på Viva, peger Vivas
webhook på `/api/table-orders/viva/webhook?k=<VIVA_WEBHOOK_TOKEN>`, og Vivas
success/failure-URL (fælles for alle betalinger) sættes i Vivas dashboard til
`https://bakkenshvile.dk/bord/kvittering` og `https://bakkenshvile.dk/bord/afbrudt`.

---

## 10. Status og næste skridt

**I drift:** forside, billetkøb, drikkekort, genbestilling, bordplan, QR-print,
varsel-cron.

**Under opbygning (ikke live):** QR-bordbestilling og barskærm — koden er bygget
med testtilstand og fail-closed sikkerhedskontakter. Bordbestillingen bruges som
**pilot for Viva.com Smart Checkout** og kører pt. i **demo** (`VIVA_ENV=demo`,
`PAYMENT_PROVIDER=viva`); der kan skiftes tilbage til Stripe med ét
miljøvariabel-skift. Før live mangler:
- Valg og tilkobling af et **lovligt kassesystem** til salgsregistrering (fælles
  blokering — gælder uanset betalingsudbyder).
- Verifikation af Viva-webhooken i Vivas dashboard (GET-handshake mod
  `/api/table-orders/viva/webhook?k=…`).
- Skift fra demo til live (`VIVA_ENV=live`, eller Stripe live-nøgler) og
  aktivering af begge `TABLE_ORDERING_*`-flag.

**Kendte begrænsninger i billetflowet:**
- Sitet viser i øjeblikket kun **det første** event i Airtable (ingen håndtering
  af flere samtidige events endnu).
- Koblingen mellem de konkrete valgte billetter/tilvalg og selve Booking-posten
  er delvis — det samlede antal og særlige ønsker gemmes, mens linjedetaljerne
  ligger i Stripe-kvitteringen.

---

## 11. Kontakt

- Adresse: Dyrehavsbakken 38, 2930 Klampenborg
- Spørgsmål / booking af syngepiger: `kontor@bakkenshvile.dk`
- Instagram: [@bakkenshvile](https://www.instagram.com/bakkenshvile/) · Facebook: [bakkenshvile](https://www.facebook.com/bakkenshvile)
