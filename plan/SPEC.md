# Bordplan: gæsteliste, numre, bemærkninger og drikkevarer

Godkendt af ejeren 01-11-2026 (punkt 1, 2, 3, 4, 5, 8 og 9 af hans 12 punkter).
Punkt 6–7 (placeringsregler), 10 (bookingopslag), 11 (betalingsfrist) og 12
(kapacitet fra admin) kommer i hver sin senere pull request.

## Hvad bordplanen (/admin) skal kunne

1. **Fast gæstenummer pr. aften.** Hver booking får et nummer efter
   bestillingstidspunktet. To bookinger fra samme mail på samme dag (dansk
   tid) får samme nummer. Et nummer ændres aldrig, når det først er givet;
   slettes en booking, mangler nummeret bare. Nummeret gemmes i Airtable-feltet
   "Gæstenummer", så det følger bookingen fra bestilling til show.
   - Kun bookinger med status "Betalt" eller "Ekstra – afventer betaling" får
     nummer. "Afventer betaling" (forladt kurv), "Annulleret" og "Udløbet"
     får intet.
   - Bestillingstidspunktet er feltet "Bestilt"; er det tomt, bruges postens
     oprettelsestidspunkt i Airtable.
2. **Først bestilte øverst** inden for hver kategori.
3. **Billetter tilbage** vises ved hver kategori, ud fra pladsbogen og
   forestillingens kapacitet (samme tal som /admin/kapacitet).
4. **Opdeling på kategorier.** En booking med billetter i flere kategorier
   står i hver kategori med det rigtige antal, og med samme gæstenummer.
5. **Forslaget vises som salen:** én linje pr. række (11–15, 21–25 osv.;
   række 7–9 har 4 borde, række 10 har 2).
8. **Bemærkninger:** stjerne efter nummeret, når kunden har skrevet noget i
   "Særlige ønsker". Systemtekster (fx "Fra TicketCloud, gl. bord 12",
   "Show: …") tæller ikke. Bemærkningerne står under listen.
9. **Drikkevarer:** tydeligt mærke efter navnet, når "Tilvalg" er udfyldt, og
   en liste over aftenens forudbestilte drikkevarer under gæstelisten.

## Rører

Persondata (visning af navn, mail, bemærkninger) og skrivning af ét nyt
Airtable-felt ("Gæstenummer"). Ingen betaling, ingen mails, ingen cron, ingen
databasemigration.
