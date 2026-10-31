# Opgaver – ekstra betalte billetter

- [x] 1. Tests: prisberegning serverside for ekstrabilletter (ingen tilvalg, pris + gebyr fra Airtable, browserens beløb ignoreres)
- [x] 2. Tests: advarsel ved fuld kategori og "Opret alligevel"
- [x] 3. Tests: hold i 24 timer uden loft, frigivelse ved udløb, sen betaling tager pladserne igen
- [x] 4. Tests: webhooken behandler en betalt ekstrabillet som et almindeligt billetkøb (beløbskontrol, ingen dobbeltbetaling, fejlet → betalt)
- [x] 5. Migration 006 (ny kilde "ekstra" i seat_holds) – afleveres som SQL til ejeren
- [x] 6. lib/seat-holds.ts: reserverUdenLoft (kilde "ekstra", holdetid i minutter)
- [x] 7. lib/payments: Viva-ordre med paymentTimeout 86400 og billetkilden
- [x] 8. app/api/admin/ekstrabillet/route.ts: validering, advarsel, Airtable, hold, Viva, ticket_payments, mail
- [x] 9. Betalingsmail til gæsten (lib/mail/layout.ts) med knappen "Betal dine billetter"
- [x] 10. app/admin/ekstrabillet: formular, advarsel, visning af bookingnummer og link
- [x] 11. Markering "Ekstra – afventer betaling" / "Udløbet" i bordplanen
- [x] 12. /funktioner: kort for Ekstra betalte billetter, Gavekort og Kapacitet
- [ ] 13. Typecheck, lint, alle tests, build; pull request (flettes ikke uden udtrykkeligt ja)

Afvigelser fra planen: "Udløbet" sættes, når bordplanen for forestillingen åbnes (ikke på ekstrabilletsiden). Lint er ikke sat op i repoet og kunne ikke køres.
