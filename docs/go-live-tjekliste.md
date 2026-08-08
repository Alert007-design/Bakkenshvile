# Go-live-tjekliste — SEO og synlighed

Gemte opfølgningspunkter fra SEO-gennemgangen (august 2026). Tages op, når
sitet går live på `bakkenshvile.dk`. Rækkefølgen er prioriteret.

## Prioriterede næste skridt

1. **SITE_URL**: Sæt `SITE_URL=https://bakkenshvile.dk` i Vercel, når domænet
   peger korrekt — canonicals, sitemap, hreflang og OG-URL'er følger
   automatisk med. Verificér domænet i Google Search Console og indsend
   `/sitemap.xml`.
2. **Google Business Profile**: Opret/gør krav på profilen med samme NAP som
   sitet (Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg), kategori
   "Performing arts theater", link til sitet. Indsæt derefter Maps-linket i
   `lib/site-config.ts` (`GOOGLE_MAPS_URL`) — det vises automatisk på
   `/praktisk`.
3. **Ekstern booking**: Udfyld TODO'erne for booking af sangerinderne
   (prisniveau, varighed, geografisk område, antal medvirkende, tekniske
   krav) i `app/underholdning-til-fest/page.tsx` — løfter sidens kommercielle
   værdi markant.
4. **301-redirects**: Skaf listen over det gamle sites URL'er (Search
   Console/serverlog) og lav 301-mapping til de mest præcise nye URL'er,
   FØR domæneskiftet. Redirect aldrig alt blindt til forsiden.
5. **Biografier**: Tilføj faktatjekkede biografier for de fire sangerinder
   (inkl. Dot Wessmans eventuelle officielle rolle) i `lib/site-config.ts` —
   vises på `/sangerinderne`.
6. **Kronologi**: Udbyg `/historie` med kildebelagte årstal og begivenheder
   (kendte sangerinder gennem tiden, ombygninger, tidligere jubilæer).
7. **Gavekort**: Afklar om gavekort skal være et produkt. Først derefter
   oprettes side + salgsflow (der findes i dag ingen gavekortfunktion).
8. **Engelsk sektion**: Udbyg til fuld `/en/`-sektion (tickets, history,
   practical info). Arkitekturen (hreflang, sideregister i `lib/seo.ts`) er
   forberedt.
9. **Analytics**: Vælg privatlivsvenlig analytics med lovligt samtykke og mål
   events: ticket_click, booking_click, phone_click, email_click,
   directions_click.
10. **Pressekit**: Læg pressemateriale på `/150-aar` med højtopløste fotos,
    fotografkreditering og brugsbetingelser.

## Øvrige eksterne opgaver

- **TicketCloud/billetdomæne**: Billetflowet ligger på hoveddomænet (`/book`).
  Hvis `billetter.bakkenshvile.dk` findes eksternt, skal det redirecte
  til `/book`.
- **Trustpilot/anmeldelser**: Etablér en verificerbar anmeldelseskilde, før
  anmeldelser (og evt. structured data for dem) vises på sitet.
- **Backlinks**: Bakken.dk, VisitDenmark/Wonderful Copenhagen samt
  presseomtale af 150-års jubilæet i 2027.

## Manglende data (må ikke gættes — udfyldes ved kilden)

- Telefonnummer → `lib/legal-content.ts` (`COMPANY.phone`)
- Geo-koordinater og åbningstider → `lib/seo.ts` (venue-schema, markeret TODO)
- Showets varighed, parkering, spisemuligheder, tilgængelighed →
  `app/praktisk/page.tsx` (FAQ, markeret TODO)
- Relation til evt. officielle firmapakker via Bakken.dk →
  `app/underholdning-til-fest/page.tsx`
