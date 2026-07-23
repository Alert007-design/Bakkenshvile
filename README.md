# Bakkens Hvile — samlet website

Ét Next.js-site med to dele:

- **Forsiden (`/`)** — det flotte marketing-design (sort/guld, sangerinderne,
  priser, galleri, kontakt, samt en kontaktformular til booking af
  syngepigerne til private arrangementer)
- **Billetkøb (`/book`)** — booking-flowet der henter data fra Airtable,
  lader gæster vælge billetter og tilvalg, og sender dem til Stripe for at
  betale

Alle "Køb billetter"-knapper på forsiden peger nu internt på `/book` i
stedet for den gamle eksterne TicketCloud-side.

## Sådan får du den op at køre

1. **Læg filerne ind i jeres repo**
   Kopiér alle filer fra denne mappe ind i `Alert007-design/Bakkenshvile`
   (behold mappestrukturen — `app/`, `lib/` osv.).

2. **Opret en Airtable-token**
   Gå til [airtable.com/create/tokens](https://airtable.com/create/tokens),
   opret et personligt access-token med `data.records:read` og
   `data.records:write` på basen "Bakkens Hvile", og kopiér tokenet.

3. **Opret en Stripe-konto og hent nøgler**
   Gå til [dashboard.stripe.com](https://dashboard.stripe.com/register) (I kan
   starte i testtilstand). Under Developers → API keys finder I jeres
   "Secret key" (starter med `sk_test_...` i testtilstand).

4. **Sæt miljøvariabler i Vercel**
   I jeres Vercel-projekt ("bakkenshvile") → Settings → Environment Variables:
   - `AIRTABLE_TOKEN` = tokenet fra trin 2
   - `AIRTABLE_BASE_ID` = `appZsfoSvInd41kQm`
   - `STRIPE_SECRET_KEY` = secret key fra trin 3

5. **Opret en Stripe-webhook** (kan gøres efter første deploy, når I kender
   URL'en)
   I Stripe Dashboard → Developers → Webhooks → "Add endpoint":
   - Endpoint-URL: `https://bakkenshvile.vercel.app/api/webhook`
   - Event: `checkout.session.completed`
   Kopiér "Signing secret" og sæt den som `STRIPE_WEBHOOK_SECRET` i Vercel.

6. **Push til GitHub** — Vercel bygger og deployer automatisk.

## Hvad siden gør lige nu

- Henter det først oprettede event, billettyper og tilvalg direkte fra Airtable
- Lader gæsten vælge antal billetter (op til max pr. kategori) og tilvalg
- Viser en løbende total nederst
- Ved "Gå til betaling" oprettes en `Customer`- og `Booking`-post i Airtable
  (status "Afventer betaling"), og gæsten sendes til Stripe Checkout
- Når betalingen er gennemført, opdaterer en webhook automatisk bookingens
  status til "Betalt" i Airtable, og gæsten lander på en bekræftelsesside

## Bordplan (/admin)

Til udsolgte shows kan I fordele gæster ved borde og printe en samlet plan:

1. Sæt en ny miljøvariabel i Vercel: `ADMIN_KEY` = en selvvalgt, hemmelig
   værdi (fx en lang tilfældig streng)
2. Tilgå `https://bakkenshvile.vercel.app/admin?key=DIN-NOEGLE`
3. Vælg en showdato, skriv bordnumre ind ud for hver booking, og klik
   "Print bordplan"

**Vigtigt:** denne side har kun en simpel nøgle som beskyttelse, ikke rigtig
login. Del ikke linket offentligt, og overvej en rigtig adgangskontrol
(fx Vercels adgangskode-beskyttelse for hele sitet) hvis I vil bruge det i
længere tid.

Ved købet kan gæster frivilligt svare på et par spørgsmål (alder, hvor de er
fra, drikkepræference, interesser, og en fritekst-note), som vises ud for
hver booking i bordplanen, så I kan sætte selskaber sammen, der passer godt
sammen.

## Hvad der endnu mangler, før den er helt "live"

- Test-tilstand: brug Stripes testkort (4242 4242 4242 4242) indtil I er
  klar til at skifte til live-nøgler
- Kobling mellem de specifikke valgte billetter/tilvalg og selve
  Booking-posten (lige nu gemmes kun det samlede antal billetter og
  særlige ønsker — selve linjerne ligger i Stripe-kvitteringen)
- Håndtering af flere events ad gangen (siden viser i øjeblikket kun det
  første event i Airtable)
