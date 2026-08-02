# Bakkens Hvile — samlet website

Ét Next.js-site med flere dele:

- **Forsiden (`/`)** — marketing-designet (sort/guld, sangerinderne, priser,
  galleri, kontakt, samt en kontaktformular til booking af syngepigerne til
  private arrangementer)
- **Billetkøb (`/book`)** — booking-flowet der henter data fra Airtable, lader
  gæster vælge billetter og tilvalg og betaler via **Viva**
- **Genbestilling (`/genbestil`)** — gæster kan bestille ekstra drikkevarer til
  en eksisterende booking (Viva)
- **QR-bordbestilling (`/bord/[nummer]`)** — gæster scanner bordets QR-kode,
  bestiller og betaler via Viva; baren ser ordrerne på arbejdsskærmen (`/bar`)
- **Interne personalesider** — `/funktioner` (samlet indgang), `/bar`, `/admin`,
  `/admin/qr`, `/admin/fribillet`, alle bag ét fælles login

Betaling sker udelukkende via **Viva** (Viva.com Smart Checkout). Stripe er
udfaset og fjernet fra projektet.

## Kom i gang

1. **Airtable-token** — opret et personligt access-token på
   [airtable.com/create/tokens](https://airtable.com/create/tokens) med
   `data.records:read` og `data.records:write` på basen "Bakkens Hvile".

2. **Miljøvariabler** — kopiér `env.example` og udfyld værdierne i Vercel
   (Settings → Environment Variables). Se `env.example` for den fulde,
   kommenterede liste. De vigtigste grupper:
   - `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`
   - **Fælles personale-login:** `STAFF_PASSWORD` (én kode til alle interne
     sider) og `STAFF_SESSION_SECRET` (lang tilfældig streng til at signere
     session-cookien)
   - **Viva:** `VIVA_ENV` (demo/live), `VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET`,
     `VIVA_MERCHANT_ID`, `VIVA_API_KEY`, `VIVA_WEBHOOK_TOKEN`,
     `VIVA_SOURCE_CODE_TICKETS`, `VIVA_SOURCE_CODE_TABLE`
   - `RESEND_API_KEY`, `EMAIL_FROM` (bekræftelses-/billetmail)
   - `SITE_URL` (sitets kanoniske basis-URL — kilde til alle absolutte URL'er)
   - QR-bordbestilling: `TABLE_QR_SECRET`, `TABLE_TOKEN_VERSION`,
     `TABLE_ORDERING_ENABLED`, `TABLE_ORDERING_LIVE`

3. **Viva-webhook** — opret en webhook i Viva, der peger på
   `https://<dit-domæne>/api/table-orders/viva/webhook?k=<VIVA_WEBHOOK_TOKEN>`.
   Endpointet svarer på Vivas GET-handshake med verifikationsnøglen og
   behandler POST-events. Webhooken henter ALTID transaktionen hos Viva og
   stoler aldrig på payloaden.

4. **Push til GitHub** — Vercel bygger og deployer automatisk.

## Betaling og sikkerhed (Viva)

- Beløb, valuta, ordrenummer og varelinjer fastlægges og valideres altid
  server-side. Browseren sender kun hvad der er valgt og antal — aldrig beløb.
- En betaling markeres først som gennemført, når den er verificeret server-side
  hos Viva (beløb + valuta + reference kontrolleres mod den oprindelige ordre).
- Webhook-/callbackbehandlingen er idempotent (samme betaling kan modtages
  flere gange uden at oprette flere ordrer eller registrere betalingen igen).
- Live-betaling er spærret pr. flow (fail-closed): `VIVA_ENV=live` kræver
  `TICKETS_LIVE=true` for billetter og `TABLE_ORDERING_LIVE=true` for
  bordbestilling. Test- og live-oplysninger holdes adskilt.

## Fælles personale-login

Alle interne sider og interne API-ruter er beskyttet af ét fælles login:

- Én adgangskode (`STAFF_PASSWORD`) valideres KUN server-side. Koden fremgår
  aldrig af URL'en, HTML'en eller klientens JavaScript.
- Efter login sættes en kortvarig, signeret session-cookie (`HttpOnly`,
  `Secure`, `SameSite=Strict`). Muterende kald beskyttes desuden med et
  CSRF-token.
- `middleware.ts` er det centrale værn: uden gyldig session omdirigeres
  sidekald til `/login`, og API-kald besvares med 401.
- Log ud via knappen på `/funktioner` (eller `/api/auth/logout`).
- Login er ratebegrænset med midlertidig spærring efter gentagne fejlforsøg.

`/funktioner` er den samlede indgang for personalet med links til alle interne
funktioner og en tydelig status pr. funktion (Aktiv, Under test, Ikke
aktiveret, Afventer Viva-liveopsætning, Afventer lovlig kasseløsning).

## Bordplan (`/admin`) og fribilletter (`/admin/fribillet`)

Tilgås via `/funktioner` bag det fælles login (ingen nøgle i URL'en). På
bordplanen kan I tildele gæster til borde, få et automatisk forslag ud fra de
frivillige matchsvar, og printe planen. På fribillet-siden kan I udstede en
gratis billet (0 kr., markeres straks betalt) til fx æresgæster.

## QR-koder (`/admin/qr`)

Generér og print QR-ark til bordene. Hvert bord har sin egen QR-kode med et
sikkert, ikke-gætteligt token (HMAC med `TABLE_QR_SECRET`). Hæv
`TABLE_TOKEN_VERSION` for at rotere alle koder, hvis en kode lækkes.

## Før QR-bordbestilling og livebetaling aktiveres

- Test først i Vivas testmiljø (`VIVA_ENV=demo`). Aktivér ikke livebetaling,
  før Vivas liveopsætning og de nødvendige driftsmæssige og retlige
  forudsætninger (herunder en lovlig kasseløsning) er på plads.
- QR-bordbestilling styres af `TABLE_ORDERING_ENABLED` (funktionen) og
  `TABLE_ORDERING_LIVE` (livebetaling). Den offentlige omtale af QR-bestilling
  på forsiden og drikkekortet vises kun, når funktionen reelt er aktiveret.
