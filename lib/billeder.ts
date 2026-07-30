// Ét centralt sted for alle billedstier, -mål og alt-tekster.
//
// Filnavnene i public/ indeholder mellemrum og parenteser (fx "BH (17).jpeg").
// Rør dem ikke — alle stier går gennem denne fil, aldrig som rå strenge i JSX.
//
// Alle mål er de faktiske pixelmål efter EXIF-rotation (fra husets katalog).
// `maksVisningsbredde` er den største bredde, billedet må vises i, uden at det
// bliver strukket eller grynet.
//
// EXIF-rotation: BH (4), (5), (14), (17), (24) og (25) bærer EXIF-rotation og
// skal tjekkes visuelt efter deploy for, om de vender rigtigt.
// Endnu ikke gennemgået visuelt: BH (23), (24), (25), (26), FirePiger.png og
// "Tre piger.png" — alt-teksterne herunder er foreløbige og bør bekræftes.

export type Billede = {
  src: string;
  alt: string;
  bredde: number;
  hoejde: number;
  maksVisningsbredde: number;
};

export const billeder = {
  // --- Hero og forside ---
  syngepigerFloejlstaepper: {
    src: "/BH (17).jpeg", // EXIF-rotation — tjek efter deploy
    alt: "De fire syngepiger kigger smilende frem mellem scenens røde fløjlstæpper",
    bredde: 3024,
    hoejde: 4032,
    maksVisningsbredde: 1600,
  },
  facaden: {
    src: "/BH (19).jpeg",
    alt: "Bakkens Hviles grønne facade på Dyrehavsbakken med neonfiguren på taget",
    bredde: 4275,
    hoejde: 4206,
    maksVisningsbredde: 1600,
  },
  showetRoedeKjoler: {
    src: "/BH (18).jpeg",
    alt: "De fire syngepiger på scenen i røde kjoler",
    bredde: 913,
    hoejde: 1143,
    maksVisningsbredde: 900,
  },

  // --- Jubilæum og historie (1877–2027) ---
  dotUngdomMedRoser: {
    src: "/BH (16).jpeg",
    alt: "Ungt arkivfoto af Dot Wessman siddende med et fang røde roser",
    bredde: 848,
    hoejde: 1232,
    maksVisningsbredde: 800,
  },
  kennethIGarderobedoeren: {
    src: "/BH (22).jpeg",
    alt: "Pianisten Kenneth Sichlau i garderobedøren, omgivet af årtiers autografer på karmen",
    bredde: 1169,
    hoejde: 1647,
    maksVisningsbredde: 1100,
  },
  arkivfotoGyldenkjole: {
    // Foto af et indrammet foto — refleksioner i glasset. Brug småt.
    src: "/BH (9).jpeg",
    alt: "Arkivfoto af en syngepige i gyldenkjole med roser, set bagfra i blåt scenelys",
    bredde: 2892,
    hoejde: 3823,
    maksVisningsbredde: 1200,
  },

  // --- Salen ---
  denTommeSal: {
    // Skiltet "147 ÅR" er svagt synligt øverst.
    src: "/BH (7).jpeg",
    alt: "Den tomme sal med dækkede borde og scenen i baggrunden før publikum lukkes ind",
    bredde: 2636,
    hoejde: 4032,
    maksVisningsbredde: 1600,
  },
  salenMedPjerrot: {
    src: "/BH (5).jpeg", // EXIF-rotation — tjek efter deploy
    alt: "Salen set fra siden med det gamle vægmaleri af pjerrot og bakkegæster",
    bredde: 3024,
    hoejde: 4032,
    maksVisningsbredde: 1600,
  },
  syngepigerVedBord: {
    src: "/BH (2).jpeg",
    alt: "Fire syngepiger sidder omkring et bord i salen foran vægmaleriet",
    bredde: 3024,
    hoejde: 2919,
    maksVisningsbredde: 1600,
  },
  dotVedBord21: {
    // Bruges på /book.
    src: "/BH (20).jpeg",
    alt: "Dot Wessman i grøn fløjl og høj hat ved et dækket bord i den tomme sal",
    bredde: 880,
    hoejde: 1168,
    maksVisningsbredde: 850,
  },

  // --- Showet ---
  blomstersangen: {
    // Skiltet "148 ÅR" er øverst til venstre — beskær det væk via object-position.
    src: "/BH (6).jpeg",
    alt: "De fire syngepiger synger blomstersangen med favnen fuld af røde roser",
    bredde: 4283,
    hoejde: 3950,
    maksVisningsbredde: 1600,
  },
  dotAleneMedRose: {
    src: "/BH (8).jpeg",
    alt: "Dot Wessman på scenen med udbredte arme og en enkelt rød rose i hånden",
    bredde: 1310,
    hoejde: 1312,
    maksVisningsbredde: 1250,
  },
  dotPaaRaekvaerket: {
    src: "/BH (13).jpeg",
    alt: "Dot Wessman i lyserød kjole siddende på scenens smedejernsrækværk",
    bredde: 974,
    hoejde: 1590,
    maksVisningsbredde: 950,
  },
  sangSetNedefra: {
    // Meget smal — kun i smal spalte eller mosaikstribe.
    src: "/BH (21).jpeg",
    alt: "En syngepige i sølvhvid kjole synger i mikrofonen, set nedefra fra salen",
    bredde: 688,
    hoejde: 1504,
    maksVisningsbredde: 660,
  },
  toPaaScenen: {
    // Meget smal — samme forbehold som ovenfor.
    src: "/BH (11).jpeg",
    alt: "To syngepiger på scenen i pink og orange, midt i en replik",
    bredde: 1012,
    hoejde: 2199,
    maksVisningsbredde: 980,
  },
  alleFemOpstillet: {
    // Lille fil — brug ikke stort.
    src: "/BH (12).jpeg",
    alt: "De fire syngepiger og pianisten opstillet på scenen i grønne og gyldne kostumer",
    bredde: 956,
    hoejde: 1035,
    maksVisningsbredde: 920,
  },
  toPaaSceneStoleneBagfra: {
    src: "/BH (3).jpeg",
    alt: "To syngepiger på deres stole på scenen, set bagfra med baren i baggrunden",
    bredde: 2285,
    hoejde: 2994,
    maksVisningsbredde: 1400,
  },

  // --- Bag scenen ---
  denTommeGarderobe: {
    src: "/BH (14).jpeg", // EXIF-rotation — tjek efter deploy
    alt: "Den tomme garderobe med oplyste sminkespejle og rækker af kostumer",
    bredde: 4284,
    hoejde: 5712,
    maksVisningsbredde: 1600,
  },
  garderobenMedKenneth: {
    src: "/BH (1).jpeg",
    alt: "Syngepigerne og pianisten Kenneth Sichlau i garderoben, klar til showstart",
    bredde: 3024,
    hoejde: 3214,
    maksVisningsbredde: 1600,
  },
  dotVedSminkebordet: {
    src: "/BH (4).jpeg", // EXIF-rotation — tjek efter deploy
    alt: "Dot Wessman ved sit sminkebord i garderoben under showet",
    bredde: 3024,
    hoejde: 4032,
    maksVisningsbredde: 1600,
  },

  // --- Endnu ikke gennemgået visuelt (alt-tekst foreløbig — bekræft med huset) ---
  annPortraet: {
    src: "/BH (23).jpeg",
    alt: "Portræt af syngepigen Ann Farholt",
    bredde: 1170,
    hoejde: 1841,
    maksVisningsbredde: 1100,
  },
  roserTilScenen: {
    src: "/BH (24).jpeg", // EXIF-rotation — tjek efter deploy
    alt: "Røde roser til scenen med en kulturomtale i baggrunden",
    bredde: 3024,
    hoejde: 4032,
    maksVisningsbredde: 1600,
  },
  garderobenFoerShow: {
    src: "/BH (25).jpeg", // EXIF-rotation — tjek efter deploy
    alt: "Garderoben før showet med Ann, Tina og pianisten Kenneth",
    bredde: 3024,
    hoejde: 4032,
    maksVisningsbredde: 1600,
  },
  tinaIGarderoben: {
    src: "/BH (26).jpeg",
    alt: "Syngepigen Tina i garderoben",
    bredde: 1113,
    hoejde: 1734,
    maksVisningsbredde: 1050,
  },
  firePigerVedTaeppet: {
    src: "/FirePiger.png",
    alt: "De fire syngepiger ved scenens tæppe",
    bredde: 1206,
    hoejde: 2622,
    maksVisningsbredde: 1100,
  },
  trePigerVedTaeppet: {
    // Mellemrum i filnavnet — tjek efter deploy, at billedet indlæses.
    src: "/Tre piger.png",
    alt: "De tre syngepiger ved scenens tæppe",
    bredde: 1206,
    hoejde: 2622,
    maksVisningsbredde: 1100,
  },

  // --- Kapelmester sammen med syngepigerne ---
  kennethMedSyngepigerne: {
    src: "/KSai.jpg",
    alt: "Kapelmester Kenneth Sichlau sammen med syngepigerne i Bakkens Hvile",
    bredde: 1248,
    hoejde: 832,
    maksVisningsbredde: 1248,
  },

  // --- Sangerinde-portrætter (dedikerede lokale kopier) ---
  // Erstatter tidligere hotlinks til bakkenshvile.dk, som lukkes ned.
  annFarholt: {
    src: "/ann-farholt.jpg",
    alt: "Portræt af syngepigen Ann Farholt",
    bredde: 1200,
    hoejde: 1348,
    maksVisningsbredde: 1200,
  },
  susMathiasen: {
    src: "/sus-mathiasen.jpg",
    alt: "Portræt af syngepigen Sus Mathiasen",
    bredde: 1395,
    hoejde: 1498,
    maksVisningsbredde: 1395,
  },
  dotWessman: {
    src: "/dot-wessman.jpg",
    alt: "Portræt af syngepigen Dot Wessman",
    bredde: 1520,
    hoejde: 1506,
    maksVisningsbredde: 1520,
  },
  tinaGrunwald: {
    src: "/tina-grunwald.jpg",
    alt: "Portræt af syngepigen Tina Grunwald",
    bredde: 1493,
    hoejde: 1536,
    maksVisningsbredde: 1493,
  },
} satisfies Record<string, Billede>;

export type BilledeNoegle = keyof typeof billeder;
