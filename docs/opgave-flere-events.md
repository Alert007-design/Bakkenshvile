# Opgave: flere samtidige events + serverside billetpriser

Arbejd i dette repo (Bakkens Hvile, Next.js 14 App Router, TypeScript). Al kode,
kommentarer, commit-beskeder og UI-tekst skal være på **dansk**. Lav ingen
ændringer i QR-bordbestillingen (`app/bord/**`, `app/bar/**`,
`app/api/table-orders/**`, `lib/orders.ts`, `lib/hall-state.ts`,
`lib/table-*.ts`) — den er under opbygning og ikke live.

Læs `docs/projektbeskrivelse.md` først. Ved tvivl om priser, borde eller
sikkerhed: følg den frem for at gætte.

## Baggrund

`/book` viser allerede alle events fra Airtable med en datovælger, og
billettyper filtreres på eventets prisgruppe. Men:

1. Afholdte datoer filtreres ikke fra — hverken i `/book`, `/admin` eller
   barens eventliste.
2. `app/components/BookingClient.tsx` sender **priser** (`unitAmount`) til
   `POST /api/checkout`, som bruger dem direkte. Med flere prisgrupper kan en
   manipuleret klient parre en billig prisgruppe med et dyrt show.
3. Serveren validerer kun `soldOut` — ikke om de valgte billettyper hører til
   eventets prisgruppe, og ikke om datoen er passeret.
4. Events-felter mappes hver for sig fire steder.

## Trin 1 — `lib/events.ts` (fælles kilde til forestillinger)

Opret filen, hvis den ikke findes. Den skal eksportere:

- `type ShowDate = { id, title, date, time, duration, notes, priceGroup, soldOut }`
- `toShowDate(record: AirtableRecord): ShowDate` — mapper via `FIELDS.event` og
  `priceGroupName`, tåler manglende felter.
- `danishToday(now?: Date): string` — dagens dato i `Europe/Copenhagen` som
  `YYYY-MM-DD` via `Intl.DateTimeFormat("en-CA", ...)`. Serveren kører i UTC på
  Vercel, så datoen må aldrig udledes af servertiden.
- `isUpcoming(date, today?): boolean` — showdagen selv tæller med (der sælges
  billetter frem til aftenens forestilling). Tom eller ugyldig dato → `false`.
- `listShowDates(opts?: { includePast?: boolean; ttlMs?: number })` — bruger
  `cachedListRecords(TABLES.events, ttlMs ?? 60_000)`, sorterer kronologisk.
- `getShowDate(id): Promise<ShowDate | null>` — validerer id mod
  `/^rec[A-Za-z0-9]{14}$/` før opslag, returnerer `null` ved fejl.
- `isBookable(show, today?)` — `isUpcoming(...) && !show.soldOut`.

Tjek at `AirtableRecord`, `cachedListRecords`, `getRecord` og `priceGroupName`
faktisk eksporteres fra `lib/airtable.ts`, og tilføj eksporten hvis ikke.

## Trin 2 — ny checkout-kontrakt (det vigtigste)

Browseren må aldrig sende beløb. Ny request-body til `POST /api/checkout`:

```ts
{
  showId: string,
  tickets: { ticketTypeId: string, quantity: number }[],
  addons:  { addonId: string, quantity: number }[],
  customer: { ... },        // uændret
  specialRequests?: string, // uændret
  matching?: { ... }        // uændret
}
```

Læg valideringen i en **ren, testbar funktion** i en ny `lib/ticket-checkout.ts`
— samme mønster som `lib/checkout.ts` bruger for bordbestillingen. Den skal tage
event, billettyper og tilvalg som argumenter (ingen netværkskald indeni) og
returnere enten `{ ok: false, error, status }` eller `{ ok: true, lines, totals,
ticketBreakdown, addonBreakdown }`.

Regler den skal håndhæve:

- Ukendt `showId` → 400. Afholdt dato (`!isUpcoming`) → 400. Udsolgt → 400.
- Ukendt `ticketTypeId`/`addonId` → 400.
- Billettype hvis `priceGroup` ikke matcher eventets prisgruppe → 400.
- `quantity` skal være et heltal ≥ 0; over `maxCount` for billettypen → 400.
- Mindst én billet i alt, ellers 400.
- **Alle beløb beregnes ud fra Airtable-værdierne**, aldrig fra input.
- Onlinerabatten (10 %) gælder **kun** tilvalg — aldrig billetpriser eller
  gebyrer. Brug `discountedAddonUnitKr` / `addonsTotalDiscountKr` fra
  `lib/pricing.ts`, så linjerne summerer præcis til totalen ligesom i dag.

`app/api/checkout/route.ts` henter derefter event (`getShowDate`), billettyper og
tilvalg fra Airtable, kalder valideringen, og bygger betalingslinjerne af
resultatet (betaling sker via Viva; Stripe er udfaset). Behold linjenavnet
`Billet: <kategori> — <showlabel>`, men byg
`ticketBreakdown` (`"A+ x2, B x1"`) direkte fra de validerede linjer i stedet for
at regex-parse navnene — fjern `summarizeTicketCategories`. Booking-posten i
Airtable skal skrives med samme felter som nu.

Opdater `app/components/BookingClient.tsx` til den nye kontrakt. UI'et og den
viste total ændrer sig ikke — klientens beregning bliver rent kosmetisk, og
serverens tal er de autoritative.

## Trin 3 — brug `listShowDates()` alle fire steder

- `app/book/page.tsx` — kun kommende datoer.
- `app/api/bar/hall-state/route.ts` (`upcomingEvents`) — kun kommende datoer.
- `app/admin/page.tsx` — `includePast: true`; bordplaner for afholdte shows skal
  stadig kunne slås op.
- `app/api/cron/varsel/route.ts` — behold den eksisterende dato-filtrering på
  `danishDatePlus(2)`, men genbrug `toShowDate`/`danishToday` frem for egen
  mapping, hvis det kan gøres uden at ændre adfærd.

## Trin 4 — tests (Vitest, `npm test`)

- `lib/events.test.ts`: `isUpcoming` omkring midnat dansk tid og over årsskifte;
  `toShowDate` med manglende felter; `getShowDate` afviser et ugyldigt id uden
  netværkskald.
- `lib/ticket-checkout.test.ts`: prisgruppe-mismatch afvises; udsolgt og afholdt
  event afvises; `maxCount` håndhæves; totalen ignorerer priser i input; rabatten
  rammer kun tilvalg — en billet med gebyr får præcis fuld pris.

## Til sidst

Opdater `docs/projektbeskrivelse.md` og `README.md`: fjern den forældede
sætning om at sitet kun viser det første event, og beskriv i stedet at
billetpriser genberegnes serverside ud fra eventets prisgruppe. Rør ikke
afsnittene om bordbestillingens live-status.

Kør `npm test` og `npx tsc --noEmit`, og vis mig en oversigt over ændringerne,
før du committer.
