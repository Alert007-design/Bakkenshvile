# Store selskaber med betalingsfrist (ejerens punkt 11)

Godkendt af ejeren 01-11-2026. Rører betaling, mails til kunder, det daglige
job og kundedata. Flettes FØRST, når ejeren har set det og sagt ja.

## Forløb

1. Admin opretter en reservation på /admin/selskab: forestilling, kunde (navn,
   mail, telefon, firma), billetter pr. kategori, sidste betalingsfrist og en
   intern note. Siden viser, hvor mange pladser der er tilbage i hver kategori;
   reservationen MÅ gå ud over, men kræver da en bekræftelse.
2. Pladserne holdes i pladsbogen (kilde 'selskab', uden udløbstid) til
   bookingen betales eller annulleres. Bookingen får status
   "Reserveret – afventer betaling" og feltet "Betalingsfrist" i Airtable.
3. Kunden får en mail med et link til /selskab/<bookingnr>?k=<nøgle>. Siden
   viser billetterne og drikkekortet med onlinerabat; Viva-betalingen oprettes
   først ved klik (30 minutter), så linket ikke udløber. Betalingen er et
   almindeligt billetkøb (tag "billet"), og webhooken gør bookingen "Betalt",
   gemmer drikkevarerne, sender billetten og salgsmailen til Dot.
4. Faktura: knap "Markér som betalt (faktura)" i bookingopslaget. Bookingen
   bliver "Betalt", pladserne solgt, kunden får billetten og Dot salgsmailen.
5. Daglig kørsel (eksisterende job /api/cron/varsel kl. 08 UTC):
   - 3 dage før fristen: påmindelse til kunden, hvis ikke betalt (én gang).
   - Dagen efter fristen, ubetalt: annullering (status "Annulleret",
     pladserne frigives, mail til kunden og til Dot). KUN når miljøvariablen
     SELSKAB_AUTO_ANNULLERING=true. Ellers sker intet automatisk.
6. Et mislykket betalingsforsøg frigiver IKKE selskabets pladser.

## Data

- Postgres: ny tabel `group_reservations` og kilden 'selskab' i seat_holds
  (migration 007, køres af ejeren).
- Airtable: feltet "Betalingsfrist" (oprettet) og statusvalget
  "Reserveret – afventer betaling" (oprettes automatisk ved første reservation).
