# Specifikation: to nye funktioner

Rækkefølge: funktion 1 bygges, testes og flettes først. Først derefter funktion 2.
Hver funktion har egen gren og eget pull request. Ingen af dem flettes uden
Mortens udtrykkelige ja.

## Funktion 1: Annullér booking i /admin/opslag

### Hvad personalet ser
- Når en booking er slået op, står der en knap "Annullér booking" (kun hvis
  bookingen kan annulleres, se "Hvilke bookinger").
- Knappen åbner en bekræftelsesboks med bookingnummer, navn, forestilling
  (titel, dato, tid) og antal billetter. Bunden har et felt, der skal sættes
  flueben i ("Jeg ved, at pladserne frigives, og at der ikke refunderes
  automatisk"), og to knapper: "Fortryd" og "Ja, annullér bookingen". Den
  røde knap er slukket, til fluebenet er sat.
- Efter annulleringen står der tydeligt: "Husk at refundere betalingen manuelt
  i Viva" sammen med beløbet og bookingnummeret (så betalingen er lige at finde).
  Opslaget viser bookingen med status "Annulleret", og knappen er væk.

### Hvilke bookinger kan annulleres
- Kun bookinger med status "Betalt" (almindelige køb og fribilletter).
- Allerede annullerede kan ikke annulleres igen (knappen vises ikke, og serveren
  afviser det også, hvis nogen sender kaldet alligevel).
- Bookinger, der venter på betaling (almindeligt køb, ekstrabillet, stort
  selskab), annulleres ikke her. De har en betaling, der stadig kan blive
  gennemført bagefter og ville gøre bookingen "Betalt" igen. De udløber af sig
  selv eller håndteres under Selskab. Knappen viser i stedet en kort forklaring.

### Hvad annulleringen gør (rækkefølgen er vigtig)
1. Serveren tjekker personale-login og det skjulte sikkerhedstegn (csrf), som alle
   andre personalehandlinger.
2. Serveren slår bookingen op igen i Airtable og tjekker status selv. Den
   stoler ikke på, hvad skærmen viste.
3. Status sættes til "Annulleret" i Airtable. Bookingen slettes ikke.
4. Pladserne frigives i pladsbogen (databasen), så de kan sælges igen.
5. Intet refunderes. Intet sendes til kunden.
Går trin 4 galt efter trin 3, står bookingen som annulleret, men pladserne er
stadig optaget. Det siges tydeligt til personalet, fejlen logges, og
frigivelsen er lavet, så den kan gentages uden skade.

### Hvad der sker med resten (undersøgt i koden, verificeret ved læsning)
- Forudbestilte drikkevarer: de er ikke en selvstændig bestilling, kun en
  tekstlinje på bookingen ("Tilvalg") og en del af det betalte beløb. Der er
  intet lager eller bar-ordre at rulle tilbage. Beløbet for drikkevarer indgår
  i det beløb, der skal refunderes manuelt. Genbestilte drikkevarer (en senere
  betaling på samme booking) lægges til beløbet.
- Salgsstatus (/admin/salgsstatus) og "billetter tilbage": tallene regnes ud
  fra pladsbogen. Når pladserne er frigivet, falder "Solgt", og "Til salg"
  stiger af sig selv. Fluebenet "udsolgt" på forestillingen i Airtable er
  manuelt og ændres ikke. Var forestillingen markeret udsolgt, skal personalet selv
  fjerne markeringen, hvis billetterne skal i salg igen.
- Bordplan og gæsteliste (/admin): i dag henter siden alle bookinger til
  aftenen uanset status og tæller dem med i gæstetal, gæsteliste og
  bordforslag. En annulleret booking ville derfor stadig tage plads. Derfor
  fjernes bookinger med status "Annulleret" fra bordplanen og gæstelisten.
  Det gælder også selskabsreservationer, som systemet i forvejen annullerer
  automatisk (de ligger i dag med på listen). Ændringen står som egen
  opgave, så Morten kan se den.
- Gæstenummer: bookingen beholder sit nummer i Airtable, men tæller ikke med.
  Numrene til de andre gæster ændres ikke.
- Billet og QR-kode: billetmailen har ingen QR-kode. QR-koderne i huset hører
  til bordene. Billettens gyldighed er bookingens status og at den står på
  gæstelisten. "Ugyldig" betyder derfor: status "Annulleret", væk fra
  gæsteliste og bordplan, og ingen gensendelse af billet og ingen genbestilling
  af drikkevarer på den. Selve mailen, kunden allerede har fået, kan ikke kaldes tilbage.
- Varselmail to dage før show: sendes kun til "Betalt". Annullerede får den
  ikke (allerede sådan i dag, dækkes af test).
- Sen betaling: Vivas besked om en betaling sætter bookingen til "Betalt", uden at
  kigge på den nuværende status. Derfor annulleres kun betalte bookinger, og
  genbestilling afvises på annullerede bookinger. En allerede betalt booking
  har ikke flere ventende billetbetalinger.
- Refundering: foregår kun manuelt i Viva. Ledgeren i databasen kan have
  status "refunded", hvis Viva senere melder en refundering; det røres ikke her.
- Beløbet, der vises: summen af de betalte betalinger på bookingen i
  databasen (billetkøb plus genbestilte drikkevarer). Findes ingen
  betaling (fribillet, gammel booking), bruges "Betalt i alt" fra Airtable.
  Fribillet viser "0 kr. Intet at refundere."
- Hvem og hvornår: der oprettes INTET nyt felt i Airtable (felt = ændring af
  tabeller, kræver særskilt ja). Annulleringen logges i Vercels log med
  bookingnummer (ingen navne eller mails). Se spørgsmål 3.

### Berører
Persondata (bookinger, kunder), bookingstatus i Airtable, pladsbogen i
databasen. Rører IKKE betaling hos Viva, priser, cron, miljøvariabler,
databasemigrationer eller udsendelse af mails. Ingen nye kald til AI.

## Funktion 2: Advarsel om dobbeltbooking i /book

### Hvad kunden ser
Trykker kunden "Betal", og serveren finder en betalt booking inden for den
seneste time med samme e-mail, samme forestilling og samme antal gæster,
vises en advarsel, før kunden sendes til Viva. Forslag til tekst (finpudset let):

  "Det ser ud til, at du allerede har bestilt og betalt den samme forestilling
  med det samme antal gæster inden for den seneste time. Har du ikke fået din
  bekræftelse endnu, så vent lidt og kig også i din spam-mappe. Vil du bestille
  en gang til, kan du gå videre."

Knapper: "Gå tilbage" (lukker advarslen, formularen er uændret) og
"Bestil alligevel" (gør præcis det samme, som købsknappen gør i dag).
Advarslen viser aldrig navn, bookingnummer, beløb eller andet om den første booking.

### Hvordan det virker
- Tjekket ligger i den eksisterende rute /api/checkout, EFTER at serveren har
  valideret billetter og priser og tjekket kapacitet, og FØR der oprettes
  kunde, booking, pladsreservation eller betaling. Derfor efterlader en advarsel
  ingen halve bookinger og ingen holdte pladser.
- Browseren sender første gang uden "bekræftet"-markering. Finder serveren en
  match, svarer den: "dobbeltbooking" (uden oplysninger om den anden booking),
  og der sker ikke mere. Trykker kunden "Bestil alligevel", sender browseren
  samme kald igen med markeringen "bekræftet", og serveren springer tjekket over.
- Match = en betaling med status "paid", af typen billetkøb, betalt inden for
  den seneste time (paid_at), hvor e-mailen er ens efter at store/små bogstaver
  og alle mellemrum er fjernet, OG bookingen i Airtable har status "Betalt",
  samme forestilling og samme antal billetter. (En booking, der siden er
  annulleret i funktion 1, giver derfor ingen advarsel.)
- Opslaget bruger den eksisterende betalingstabel i databasen (ticket_payments),
  som allerede har e-mail og betalingstidspunkt. Ingen nye tabeller, ingen
  migration. Højst en håndfuld Airtable-opslag, kun hvis e-mailen matcher en
  betaling inden for den time.
- Mangler e-mail (kunden gav kun telefon): intet tjek.
- Fejler opslaget (database eller Airtable): kunden sendes videre til
  betaling som i dag, og fejlen logges uden e-mail og navn. Advarslen kan aldrig
  blokere et køb.
- Genbestilling af drikkevarer og fribilletter er ikke omfattet (de går ikke
  gennem denne rute, hhv. gemmes ikke i betalingstabellen som billetkøb).

### Berører
Betalingsflowet på billetkøb (ruten /api/checkout) og persondata (e-mail
sammenlignes på serveren). Ændrer IKKE priser, beløb, Viva-kaldet, pladsreservation,
webhook, cron eller miljøvariabler. Ingen migration. Ingen nye kald til AI eller
Viva; et par ekstra databaseopslag pr. køb (forbrug: ubetydeligt).

## Ikke med
- Automatisk refundering. Mails til kunden om annullering. Annullering af
  ubetalte bookinger. Nyt Airtable-felt til annulleringstidspunkt/hvem. Mere end
  én time i dobbeltbookingstjekket. Nogen form for blokering af køb.
