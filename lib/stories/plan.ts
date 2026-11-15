// Hvilken story skal lægges op hvornår? Ren logik uden netværk, så den kan
// testes fuldt ud. Teksterne her vises offentligt på Facebook og Instagram og
// skal være korrekt, naturligt dansk.
//
// To tidspunkter om dagen (dansk tid):
//   morgen      kl. 8.25  nedtælling til sæsonen, eller "I aften" på en spilledag
//   eftermiddag kl. 16.25 gavekort (1/11–23/12), ledige pladser i sæsonen,
//                         ellers billetsalget til næste sæson

export type Slot = "morgen" | "eftermiddag";
export type StoryType = "nedtaelling" | "i-aften" | "gavekort" | "billetter" | "pladser";

export const STORY_TYPER: StoryType[] = ["nedtaelling", "i-aften", "gavekort", "billetter", "pladser"];
export const SLOTS: Slot[] = ["morgen", "eftermiddag"];

/** Dansk time, hvor hvert tidspunkt kører. Cron kører kl. xx.25 hver time. */
export const SLOT_TIME: Record<Slot, number> = { morgen: 8, eftermiddag: 16 };

export interface ShowInfo {
  /** YYYY-MM-DD */
  date: string;
  /** "HH:MM" */
  time: string;
  /** Pladser tilbage i alt. null = kunne ikke hentes. */
  tilbage: number | null;
  soldOut: boolean;
}

export interface StoryIndhold {
  type: StoryType;
  slot: Slot;
  dato: string;
  /** Filnavn i lib/stories/fotos. */
  foto: string;
  overlinje: string;
  hoved: string[];
  underlinje: string;
  bund: string;
}

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** Dato, time og minut i dansk tid (følger sommertid). */
export function danskTid(now: Date): { dato: string; time: number; minut: number } {
  const dele = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const v = (t: string) => dele.find((d) => d.type === t)?.value ?? "";
  return {
    dato: `${v("year")}-${v("month")}-${v("day")}`,
    time: Number(v("hour")),
    minut: Number(v("minute")),
  };
}

export function slotForTime(time: number): Slot | null {
  return SLOTS.find((s) => SLOT_TIME[s] === time) ?? null;
}

export function plusDage(dato: string, dage: number): string {
  const d = new Date(`${dato}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dage);
  return d.toISOString().slice(0, 10);
}

function dageMellem(fra: string, til: string): number {
  return Math.round(
    (Date.parse(`${til}T12:00:00Z`) - Date.parse(`${fra}T12:00:00Z`)) / 86_400_000
  );
}

function dagNummer(dato: string): number {
  return Math.floor(Date.parse(`${dato}T12:00:00Z`) / 86_400_000);
}

/** "20:00" -> "kl. 20.00" */
function klokken(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  return m ? `kl. ${m[1].padStart(2, "0")}.${m[2]}` : "";
}

/** "2027-05-10" -> "10. maj" */
function datoTekst(dato: string): string {
  const [, mm, dd] = dato.split("-").map(Number);
  return `${dd}. ${MAANEDER[mm - 1]}`;
}

const UGEDAGE = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
function ugedag(dato: string): string {
  return UGEDAGE[new Date(`${dato}T12:00:00Z`).getUTCDay()];
}

function hvert<T>(liste: T[], dato: string): T {
  return liste[dagNummer(dato) % liste.length];
}

const MORGENFOTOS = [
  "facade.jpg", "dot.jpg", "ann.jpg", "sus.jpg", "tina.jpg", "fire-piger.jpg",
  "scenen-roede.jpg", "fire-ved-bord.jpg", "rosen.jpg", "holdet.jpg",
  "scenen-tre.jpg", "guld.jpg", "salen.jpg",
];
const GAVEKORTFOTOS = ["tre-piger.jpg", "fire-piger.jpg", "fire-ved-bord.jpg"];
const BILLETFOTOS = ["facade.jpg", "scenen-roede.jpg", "scenen-tre.jpg", "holdet.jpg"];
const PLADSFOTOS = ["rosen.jpg", "guld.jpg", "hvid-kjole.jpg", "salen.jpg"];

/** Dage, en pause mellem to forestillinger højst må vare, før den regnes som ny sæson. */
const SAESONPAUSE = 14;

function erJubilaeum(dato: string): boolean {
  return dato.startsWith("2027-");
}

/**
 * Vælger dagens story for et tidspunkt. null = ingen story i dag.
 * `shows` skal også indeholde forestillinger fra de seneste par uger, så
 * nedtællingen ikke kører midt i sæsonen.
 */
export function vaelgStory(slot: Slot, dato: string, shows: ShowInfo[]): StoryIndhold | null {
  const sorteret = [...shows].filter((s) => s.date).sort((a, b) => a.date.localeCompare(b.date));
  const iDag = sorteret.find((s) => s.date === dato);
  const iMorgen = sorteret.find((s) => s.date === plusDage(dato, 1));
  const naeste = sorteret.find((s) => s.date > dato);
  const iSaeson = sorteret.some((s) => s.date < dato && dageMellem(s.date, dato) <= SAESONPAUSE);
  const bund = "bakkenshvile.dk";

  if (slot === "morgen") {
    if (iDag) {
      return {
        type: "i-aften", slot, dato, foto: hvert(MORGENFOTOS, dato),
        overlinje: `${ugedag(dato)} ${datoTekst(dato)}`.toUpperCase(),
        hoved: ["I aften", klokken(iDag.time)].filter(Boolean),
        underlinje: "Velkommen i Bakkens Hvile",
        bund,
      };
    }
    if (!naeste || iSaeson) return null;
    const dage = dageMellem(dato, naeste.date);
    const jubilaeum = erJubilaeum(naeste.date);
    return {
      type: "nedtaelling", slot, dato, foto: hvert(MORGENFOTOS, dato),
      overlinje: jubilaeum ? "150 ÅR · 1877–2027" : "SIDEN 1877",
      hoved: [dage === 1 ? "I morgen" : `Om ${dage} dage`],
      underlinje: jubilaeum ? "begynder jubilæumssæsonen" : "åbner Bakkens Hvile igen",
      bund,
    };
  }

  // Eftermiddag. Ledige pladser først: i aften, ellers i morgen.
  if (iDag || iMorgen) {
    const kandidat = [iDag, iMorgen].find(
      (s) => s && !s.soldOut && typeof s.tilbage === "number" && s.tilbage > 0
    );
    if (!kandidat || kandidat.tilbage === null) return null;
    const hvornaar = `${kandidat === iDag ? "i aften" : "i morgen"} ${klokken(kandidat.time)}`.trim();
    const n = kandidat.tilbage;
    return {
      type: "pladser", slot, dato, foto: hvert(PLADSFOTOS, dato),
      overlinje: "LEDIGE PLADSER",
      hoved: n <= 20 ? [n === 1 ? "1 ledig plads" : `${n} ledige pladser`, hvornaar] : ["Stadig pladser", hvornaar],
      underlinje: "Bakkesangerinderne på scenen",
      bund,
    };
  }

  const [, mm, dd] = dato.split("-").map(Number);
  if (naeste && !iSaeson && (mm === 11 || (mm === 12 && dd <= 23))) {
    return {
      type: "gavekort", slot, dato, foto: hvert(GAVEKORTFOTOS, dato),
      overlinje: "GAVEKORT",
      hoved: ["Giv en aften", "i Bakkens Hvile"],
      underlinje: "Modtageren vælger selv datoen",
      bund: "bakkenshvile.dk/gavekort",
    };
  }

  if (naeste && !iSaeson) {
    const aar = naeste.date.slice(0, 4);
    const jubilaeum = erJubilaeum(naeste.date);
    return {
      type: "billetter", slot, dato, foto: hvert(BILLETFOTOS, dato),
      overlinje: jubilaeum ? "150 ÅR · 1877–2027" : "BAKKENS HVILE",
      hoved: [`Billetter til ${aar}`, "er i salg"],
      underlinje: `${jubilaeum ? "Jubilæumssæsonen" : "Sæsonen"} begynder ${datoTekst(naeste.date)}`,
      bund,
    };
  }

  return null;
}
