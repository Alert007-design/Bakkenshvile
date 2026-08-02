// Indhold til de juridiske sider (handelsbetingelser + privatlivspolitik).
//
// Teksterne ligger samlet her som let redigerbart indhold, så de kan opdateres
// uden at røre sidernes kode. Blokken { type: "review", ... } kan bruges til at
// markere punkter, der endnu afventer godkendelse; den vises på siden som
// "Afventer juridisk gennemgang".
//
// Bankoverførsel er fjernet, da den ikke kan vælges i købsflowet — betaling
// sker udelukkende med betalingskort via Viva. Punkter markeret { type:
// "review" } (fx præcise korttyper og overførselsgrundlag) afventer bekræftelse
// ud fra Viva-aftalen og databehandleraftalerne.

export const COMPANY = {
  name: "Bakkens Hvile",
  address: "Dyrehavsbakken 38, 2930 Klampenborg",
  cvr: "19956504",
  email: "kontor@bakkenshvile.dk",
  // Telefonfeltet vises kun, hvis der er et nummer. Lad stå tomt, indtil et
  // nummer er angivet.
  phone: "",
} as const;

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "review"; text: string };

export interface LegalSection {
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  slug: string;
  title: string;
  intro?: string;
  sections: LegalSection[];
  updatedNote: string;
}

const UPDATED = "Sidst opdateret: 30. juli 2026.";

export const HANDELSBETINGELSER: LegalDoc = {
  slug: "handelsbetingelser",
  title: "Handelsbetingelser",
  updatedNote: UPDATED,
  sections: [
    {
      id: "virksomhedsoplysninger",
      heading: "Virksomhedsoplysninger",
      blocks: [
        {
          type: "p",
          text: `${COMPANY.name}, ${COMPANY.address}. CVR: ${COMPANY.cvr}. Kontakt: ${COMPANY.email}.`,
        },
      ],
    },
    {
      id: "betalingsmetoder",
      heading: "Betalingsmetoder",
      blocks: [
        {
          type: "p",
          text: "Betaling sker med betalingskort. Kortbetalingen afvikles sikkert via vores betalingsudbyder, Viva. Kortoplysninger indtastes direkte hos Viva og opbevares aldrig hos Bakkens Hvile.",
        },
        {
          type: "review",
          text: "De konkrete korttyper og betalingsmetoder, der accepteres, følger af Bakkens Hviles Viva-aftale og skal angives præcist her (fx Visa/Mastercard/Dankort), inden livebetaling aktiveres.",
        },
      ],
    },
    {
      id: "kobs-og-betalingsbetingelser",
      heading: "Købs- og betalingsbetingelser",
      blocks: [
        {
          type: "p",
          text: "Ved bekræftelse af købs- og betalingsbetingelserne bekræfter du som kunde at have bestilt de på hjemmesiden beskrevne billetter og tilvalg.",
        },
        {
          type: "p",
          text: "Alle priser er inklusive 25 % moms. Momsbeløbet svarer til 20 % af den samlede pris inklusive moms.",
        },
      ],
    },
    {
      id: "fortrydelsesret",
      heading: "Fortrydelsesret",
      blocks: [
        {
          type: "p",
          text: "Køb af billetter til et arrangement på en bestemt dato er ikke omfattet af fortrydelsesretten, jf. forbrugeraftaleloven.",
        },
      ],
    },
    {
      id: "kontrol-af-bestillingen",
      heading: "Kontrol af bestillingen",
      blocks: [
        {
          type: "p",
          text: "Kontrollér venligst, at arrangement, dato, tidspunkt og tilvalg er i overensstemmelse med din bestilling.",
        },
        {
          type: "p",
          text: "Som minimum skal fornavn samt telefonnummer eller e-mail oplyses, da det bruges som oplysning ved arrangementet.",
        },
      ],
    },
    {
      id: "refusion-aflysning-overdragelse",
      heading: "Refusion, aflysning og overdragelse",
      blocks: [
        {
          type: "p",
          text: "Bliver du selv forhindret, kan billetten ikke byttes eller refunderes, men den kan i stedet overdrages til tredjemand.",
        },
        {
          type: "p",
          text: "Hvis en forestilling aflyses, tilbagebetales billetprisen og prisen for ikke-leverede tilvalg. Bakkens Hvile hæfter ikke for kundens øvrige udgifter eller indirekte tab som følge af aflysning eller flytning, medmindre andet følger af ufravigelig lovgivning.",
        },
      ],
    },
    {
      id: "billetter-kopiering-videresalg",
      heading: "Billetter, kopiering og videresalg",
      blocks: [
        {
          type: "p",
          text: "Bakkens Hvile har intet ansvar for problemer, som skyldes kopiering eller videresalg af billetter.",
        },
      ],
    },
    {
      id: "pris-tekst-og-systemfejl",
      heading: "Pris-, tekst- og systemfejl",
      blocks: [
        {
          type: "p",
          text: "Vi tager forbehold for fejl og mangler i priser og beskrivelser.",
        },
      ],
    },
    {
      id: "behandling-af-personoplysninger",
      heading: "Behandling af personoplysninger",
      blocks: [
        {
          type: "p",
          text: "Vi bruger udelukkende personoplysninger til at gennemføre købet og til fakturering, ikke i reklameøjemed, medmindre du udtrykkeligt har givet tilsagn herom. Oplysningerne behandles fortroligt og videregives ikke til tredjepart ud over vores databehandlere. Vi behandler personoplysninger efter databeskyttelsesforordningen (GDPR) og databeskyttelsesloven. Se privatlivspolitikken for detaljer.",
        },
      ],
    },
  ],
};

export const PRIVATLIVSPOLITIK: LegalDoc = {
  slug: "privatlivspolitik",
  title: "Privatlivspolitik",
  updatedNote: UPDATED,
  sections: [
    {
      id: "den-korte-version",
      heading: "Den korte version",
      blocks: [
        {
          type: "p",
          text: "Vi bruger kun de oplysninger, du selv angiver, for at kunne gennemføre et køb og sikre, at du har betalt for arrangementet og eventuelle tilvalg. Vi bruger ikke din e-mailadresse eller dit telefonnummer til markedsføring — kun fx hvis der sker ændringer i afholdelsen af arrangementet. Ordredataene anonymiseres inden for 60 dage efter, at arrangementet er afholdt, dog først når et eventuelt økonomisk mellemværende er afsluttet.",
        },
      ],
    },
    {
      id: "dataansvarlig",
      heading: "Dataansvarlig",
      blocks: [
        {
          type: "p",
          text: `${COMPANY.name}, ${COMPANY.address}. CVR: ${COMPANY.cvr}. Vi er ansvarlige for de oplysninger, du giver os.`,
        },
      ],
    },
    {
      id: "hvilke-oplysninger",
      heading: "Hvilke oplysninger vi behandler",
      blocks: [
        {
          type: "p",
          text: "Vi behandler de oplysninger, du selv afgiver ved booking, billetkøb, genbestilling og bordbestilling. Nedenfor står hver kategori sammen med formålet med behandlingen:",
        },
        {
          type: "ul",
          items: [
            "Navn, telefonnummer og e-mailadresse — for at kunne gennemføre købet, sende billet og bekræftelse og kontakte dig ved ændringer.",
            "Eventuelt firmanavn — hvis du bestiller på vegne af et selskab.",
            "Betalings- og bookingoplysninger (bookingnummer, ordrelinjer, beløb, betalingsstatus) — for at kunne behandle og dokumentere købet.",
            "Betalingsoplysninger, der udveksles med vores betalingsudbyder Viva — selve kortoplysningerne indtastes hos Viva og opbevares aldrig hos os; vi modtager alene en betalingsreference og betalingsstatus.",
            "Frivillige oplysninger til bordplacering (aldersgruppe, geografisk tilhørsforhold, foretrukken drik og interesser) — bruges kun, hvis du beder om at blive placeret sammen med gæster, I passer godt sammen med.",
            "Særlige ønsker og kommentarer til ordren — for at kunne imødekomme dine ønsker.",
            "Oplysninger til bordplacering (tildelt bordnummer) — for at kunne planlægge salen.",
            "Bordbestillinger og ordrehistorik (varer, antal, tidspunkt og eventuelle bemærkninger ved QR-bestilling) — for at kunne levere din bestilling til det rigtige bord.",
          ],
        },
      ],
    },
    {
      id: "formaalet",
      heading: "Formålet med behandlingen",
      blocks: [
        {
          type: "p",
          text: "Dine oplysninger bruges for at kunne levere den ydelse, du selv bestiller — billetter, tilvalg og bordbestilling — samt til betaling, dokumentation af købet, teknisk drift og fejlfinding. Formålet med hver enkelt kategori er beskrevet ovenfor.",
        },
      ],
    },
    {
      id: "behandlingsgrundlag",
      heading: "Behandlingsgrundlag",
      blocks: [
        {
          type: "p",
          text: "Vi behandler dine oplysninger for at kunne opfylde aftalen med dig om køb af billetter og tilvalg (databeskyttelsesforordningen art. 6, stk. 1, litra b) samt for at overholde retlige forpligtelser, fx bogføringsreglerne (art. 6, stk. 1, litra c).",
        },
      ],
    },
    {
      id: "opbevaringsperiode",
      heading: "Opbevaringsperiode",
      blocks: [
        {
          type: "p",
          text: "Vi anonymiserer ordredataene inden for 60 dage efter, at et arrangement er afholdt. Oplysninger, der indgår i regnskabsbilag, opbevares dog så længe, bogføringsloven kræver det, og indtil et eventuelt økonomisk mellemværende er afsluttet.",
        },
      ],
    },
    {
      id: "databehandlere",
      heading: "Databehandlere",
      blocks: [
        {
          type: "p",
          text: "Vi anvender følgende databehandlere, som alene behandler oplysningerne efter vores instruks:",
        },
        {
          type: "ul",
          items: [
            "Airtable — database for kunde- og bookingoplysninger.",
            "Viva — sikker afvikling af kortbetalinger.",
            "Resend — udsendelse af bekræftelses- og varslingsmails.",
            "Vercel — hosting og drift af hjemmesiden.",
            "Vercel Postgres — database for QR-bordbestilling.",
          ],
        },
      ],
    },
    {
      id: "overfoersel-uden-for-eu",
      heading: "Overførsel til lande uden for EU/EØS",
      blocks: [
        {
          type: "p",
          text: "Nogle af vores databehandlere er etableret uden for EU/EØS eller kan behandle oplysninger dér. I så fald sker overførslen på et gyldigt overførselsgrundlag, fx EU-Kommissionens standardkontraktbestemmelser (SCC).",
        },
        {
          type: "review",
          text: "Det præcise overførselsgrundlag for hver databehandler (herunder Viva, Airtable, Resend og Vercel) skal bekræftes ud fra databehandleraftalerne og angives her.",
        },
      ],
    },
    {
      id: "cookies",
      heading: "Cookies og eventuel markedsføring",
      blocks: [
        {
          type: "p",
          text: "Vi anvender ikke markedsførings- eller sporingscookies, og hjemmesiden bruger ikke Facebook Pixel eller lignende analyseværktøjer. Ved betaling kan vores betalingsudbyder sætte tekniske cookies, der er nødvendige for at gennemføre betalingen sikkert.",
        },
      ],
    },
    {
      id: "videregivelse",
      heading: "Videregivelse af oplysninger",
      blocks: [
        {
          type: "p",
          text: "Vi videregiver ikke dine oplysninger til tredjepart ud over de databehandlere, der er nævnt ovenfor.",
        },
      ],
    },
    {
      id: "rettigheder",
      heading: "Den registreredes rettigheder",
      blocks: [
        {
          type: "p",
          text: "Efter databeskyttelsesreglerne har du bl.a. ret til indsigt i de oplysninger, vi behandler om dig, samt ret til berigtigelse, sletning, begrænsning af behandlingen, indsigelse og dataportabilitet. Kontakt os, hvis du vil gøre brug af dine rettigheder.",
        },
      ],
    },
    {
      id: "klage",
      heading: "Klage til Datatilsynet",
      blocks: [
        {
          type: "p",
          text: "Du kan klage over vores behandling af dine personoplysninger til Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby, www.datatilsynet.dk.",
        },
      ],
    },
    {
      id: "kontakt",
      heading: "Kontakt",
      blocks: [
        {
          type: "p",
          text: `Har du spørgsmål til vores behandling af dine oplysninger, er du velkommen til at kontakte os på ${COMPANY.email}.`,
        },
      ],
    },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [HANDELSBETINGELSER, PRIVATLIVSPOLITIK];
