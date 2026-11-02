# Opgaver (én ad gangen; afkryds når bygget og kontrolleret)

Regel: tests skrives først og skal fejle, før koden bygges. Efter hver opgave:
typecheck og lint. Efter hver funktion: alle tests og lokalt build.

## Funktion 1: Annullér booking (gren: claude/annuller-booking)
- [ ] 1.1 Tests, der fejler: pladsfrigivelse af betalte pladser (optaget tæller
      falder, kun den ene booking, kan gentages uden skade, flere kategorier),
      annulleringsregler (kun "Betalt"; allerede annulleret afvises; ubetalt
      afvises; ukendt booking), beløbsberegning (billet + genbestilling, fald til
      "Betalt i alt", fribillet = 0), adgang (uden login 401, uden csrf 403),
      at bordplan/gæsteliste udelader "Annulleret", at gensendelse af billet og
      genbestilling afviser annullerede.
- [ ] 1.2 lib/seat-holds.ts: ny funktion der frigiver både reserverede og
      solgte pladser for en booking (den eksisterende frigivForBooking røres ikke).
- [ ] 1.3 Ren regelfil (lib/annuller-booking.ts): afgør om en booking kan
      annulleres, og regner beløbet ud.
- [ ] 1.4 Ny rute app/api/admin/annuller (POST): login, csrf, genlæs booking,
      sæt status, frigiv pladser, svar med beløb. Fejl logges uden persondata.
- [ ] 1.5 app/admin/opslag/OpslagClient.tsx: knap, bekræftelsesboks med flueben,
      resultat med "Husk at refundere betalingen manuelt i Viva" og beløbet.
- [ ] 1.6 app/api/admin/bookings/route.ts: udelad "Annulleret" fra bordplan og
      gæsteliste.
- [ ] 1.7 Afvis gensendelse af billet (app/api/admin/resend-ticket) og
      genbestilling (lib/genbestil.ts / app/api/genbestil) på annullerede.
- [ ] 1.8 Kør alle tests, typecheck, lint og lokalt build. Pull request.
      STOP. Vent på Mortens ja til fletning. Derefter: læs resultat på siden.

## Funktion 2: Dobbeltbooking-advarsel (gren: claude/dobbeltbooking-advarsel)
Startes først, når funktion 1 er flettet.
- [ ] 2.1 Tests, der fejler (8 stk. plus et par ekstra): match; ingen match;
      mere end en time siden; andet antal; anden forestilling; ubetalt booking;
      forskellig skrivemåde af e-mail (store/små bogstaver, mellemrum); fejl i
      opslaget (kunden sendes videre, fejl logges uden e-mail); annulleret booking
      giver ingen advarsel; tom e-mail giver intet tjek; svaret indeholder ingen
      oplysninger om den første booking; "bekræftet" springer tjekket over.
- [ ] 2.2 Ny lib/dobbeltbooking.ts: opslag i betalingstabellen + Airtable-tjek.
- [ ] 2.3 app/api/checkout/route.ts: kald tjekket efter validering og kapacitet,
      før der oprettes noget; svar "dobbeltbooking"; spring over ved "bekræftet".
- [ ] 2.4 app/components/BookingClient.tsx: advarselsboks med "Gå tilbage" og
      "Bestil alligevel".
- [ ] 2.5 Kør alle tests, typecheck, lint og lokalt build. Pull request.
      STOP. Vent på Mortens ja til fletning.

## Til sidst
- [ ] Slet mappen plan/ (efter at begge funktioner er flettet og pushet).
