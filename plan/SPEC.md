# Ekstra betalte billetter fra admin (ud over kapaciteten)

Status: UDKAST – venter på ejerens godkendelse. Der er ikke skrevet kode.

## Hvad funktionen skal kunne
Personalet kan på en ny side, /admin/ekstrabillet, lægge betalte billetter ind
til en forestilling, også når en kategori eller hele forestillingen er udsolgt.
Gæsten får et betalingslink fra Viva på mail og betaler selv. Prisen er den
almindelige pris + gebyr fra Airtable og kan ikke ændres af personalet.

## Forløb
1. Personalet vælger forestilling (også udsolgte, ikke afholdte), antal
   billetter pr. kategori, gæstens navn, e-mail (krævet), telefon og en intern
   note. Siden ligner /admin/fribillet og ligger bag samme login.
2. Serveren beregner prisen (validateTicketCheckout med allowSoldOut: true,
   ingen tilvalg). Er der ikke plads nok, vises samme advarsel som ved
   fribilletter, og personalet skal trykke "Opret alligevel".
3. Ved oprettelse:
   - Kunde og booking oprettes i Airtable med status "Ekstra – afventer
     betaling" og samme felter som et almindeligt billetkøb.
   - Pladserne holdes i pladsbogen i 24 timer (ny kilde "ekstra"), uden loft.
   - Der oprettes en Viva-betalingsordre med billetkilden
     (VIVA_SOURCE_CODE_TICKETS), flow "billet" og paymentTimeout 86400 sek.
   - En række i ticket_payments med det forventede beløb, så den eksisterende
     webhook kan kontrollere beløbet og sende billet, kvittering og salgsmail
     præcis som ved et almindeligt køb.
   - Gæsten får en mail i husets design med forestilling, billetter, pris og
     en knap "Betal dine billetter".
   - Personalet ser bookingnummer og betalingslinket på skærmen (til sms).
4. Betales der: webhooken behandler det som et almindeligt billetkøb. Bookingen
   bliver "Betalt", og pladserne tælles som solgt, også selv om kategorien
   dermed er overbooket.
5. Betales der ikke inden 24 timer: pladserne gives tilbage af den eksisterende
   oprydning (frigivUdloebne kører før hvert opslag af ledige pladser), og
   bookingen markeres "Udløbet" i Airtable næste gang personalet åbner siden
   eller bordplanen. Kommer betalingen alligevel senere, får gæsten sin billet,
   og kontoret får den advarsel om sen betaling, der allerede findes.

## Vivas grænse for linkets gyldighed (verificeret i Vivas dokumentation)
- paymentTimeout angives i sekunder; standard er 1800 (30 min.).
- 86400 sek. (24 timer) er tilladt og bruges i Vivas eget eksempel.
- Vivas ISV-dokumentation angiver loftet til 432000 sek. (5 døgn).
- Værdien 65535 betyder "udløber aldrig" og må derfor ikke bruges ved et uheld.
- Viva sender ingen webhook, når en ordre udløber. Derfor styrer vi selv
  udløbet ud fra holdetiden i pladsbogen.

## Sikkerhed og robusthed
- Beløbet beregnes kun på serveren. Browseren sender kun antal.
- Beløbskontrol i webhooken som i dag: forkert beløb giver kun besked til
  kontoret.
- En booking kan ikke betales to gange (den eksisterende idempotente overgang
  pending → paid i ticket_payments).
- fejlet → betalt virker som i dag (en fejlet betaling frigiver pladserne, en
  senere gennemført betaling tager dem igen).
- Siden og API'et ligger bag personalesessionen (verifyStaffSession +
  middleware) med CSRF-tjek på oprettelsen.

## Hvad rører det
- Betaling (Viva): ja – ny betalingsordre fra admin.
- Persondata: ja – gæstens navn, e-mail og telefon gemmes som ved køb.
- Mail til rigtige modtagere: ja – betalingsmailen til gæsten.
- Database: ja – migration 006 (se nedenfor).
- Cron: nej. Ingen nye planlagte job.
- Airtable: ny valgmulighed i bookingens statusfelt.

## Migration 006 (køres af ejeren i Neons Query-fane, når koden er godkendt)
```sql
ALTER TABLE seat_holds DROP CONSTRAINT IF EXISTS seat_holds_source_check;
ALTER TABLE seat_holds ADD CONSTRAINT seat_holds_source_check
  CHECK (source IN ('checkout','fribillet','import','ekstra'));
```
Det præcise navn på den eksisterende regel kontrolleres, før SQL'en
afleveres. Migration 005 (kapacitet) skal være kørt først.

## Spørgsmål til ejeren
1. Må statusteksten i Airtable hedde "Ekstra – afventer betaling" og
   "Udløbet"? (De skal tilføjes som valg i feltet Status.)
2. Skal personalet kunne sende linket igen eller annullere en ekstrabillet
   fra siden? (Ikke med i denne omgang, medmindre I ønsker det.)
