// Flytning af en betalt reservation til en anden dato (fra /admin/opslag).
//
// Rækkefølge og hvad der sker, hvis noget fejler:
//  1) Tjek booking, forestillinger og prisforskel. Fejl her ændrer intet.
//  2) Flyt pladserne i pladsbogen i ét greb. Mangler der plads, sker intet.
//  3) Ret bookingen i Airtable (ny forestilling, bordnummer og gæstenummer
//     nulstilles, påmindelsen sættes til at gå ud igen, note). Fejler det,
//     føres pladserne tilbage, og intet er ændret.
//  4) Prisforskel: er den nye dato dyrere, oprettes en betaling af forskellen
//     i Viva (flow "prisforskel"). Er den billigere, udstedes en tilgodeseddel
//     som et betalt gavekort, der gælder på forestillingsdagen. Fejler det,
//     står flytningen ved magt, og personalet får besked på skærmen.
//  5) Kunden får en ny billet med den nye dato. Fejler mailen, får personalet
//     besked og kan sende billetten igen.
//
// Bookingnummer, betaling og tilvalg bliver ved bookingen.

import type { Queryable } from "@/lib/db";
import type { ShowDate } from "@/lib/events";
import type { TicketTypeDef } from "@/lib/ticket-checkout";
import type { CreatePaymentInput, CreatePaymentResult } from "@/lib/payments/types";
import { FIELDS } from "@/lib/airtable";
import { tilfoejNote } from "@/lib/annuller-booking";
import { KAPACITETSKATEGORIER, KATEGORI_NAVN, kapaciteterFor, type Kapacitetskategori } from "@/lib/kapacitet";
import { flytPladser, hentPladslinjer, type Pladslinje } from "@/lib/seat-holds";
import { createTicketPayment } from "@/lib/ticket-payments";
import { opretTilgodeseddel } from "@/lib/gift-cards";
import { daDateLong, daDateShort, showYear, ticketEmailHtml } from "@/lib/ticket-email";
import { FARVER, SKRIFT, escapeHtml, fremhaevetFelt } from "@/lib/mail/layout";
import { udloebTekst } from "@/lib/ekstrabillet";

/** Betalingslinket for prisforskellen gælder 24 timer, som ved ekstrabilletter. */
export const PRISFORSKEL_FRIST_MINUTTER = 24 * 60;

type Post = { id: string; fields: Record<string, unknown> };

export interface FlytDeps {
  db: Queryable;
  hentBooking(id: string): Promise<Post | null>;
  hentKunde(id: string): Promise<Post | null>;
  hentShow(id: string): Promise<ShowDate | null>;
  hentBilletTyper(): Promise<TicketTypeDef[]>;
  opdaterBooking(id: string, felter: Record<string, unknown>): Promise<void>;
  opretBetaling(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  sendMail(m: { to: string; subject: string; html: string }): Promise<void>;
  /** VIVA_SOURCE_CODE_TICKETS – samme kilde som billetkøb. */
  sourceCode: string;
  origin: string;
  nu(): Date;
  log(besked: string, ctx?: Record<string, unknown>): void;
}

export type FlytSvar =
  | {
      ok: true;
      bookingNo: string;
      fra: string;
      til: string;
      /** Positiv = kunden skal betale, negativ = kunden har penge til gode. */
      prisforskelKr: number;
      paymentRef?: string;
      betalingslink?: string;
      tilgodeseddel?: { kode: string; kr: number };
      emailed: boolean;
      /** Ting, personalet skal vide eller gøre bagefter. */
      advarsler: string[];
    }
  | { ok: false; status: number; error: string };

function tekst(v: unknown): string {
  if (v && typeof v === "object" && "name" in (v as object)) {
    return String((v as { name?: unknown }).name ?? "");
  }
  return v == null ? "" : String(v);
}

function foersteId(v: unknown): string {
  return Array.isArray(v) && typeof v[0] === "string" ? v[0] : "";
}

/** "20-05-2027 kl. 19.30" ud fra forestillingens egen dato og tid. */
function kortDatoTid(s: ShowDate): string {
  const [y, m, d] = s.date.split("-");
  const tid = s.time ? ` kl. ${s.time.replace(":", ".")}` : "";
  return `${d}-${m}-${y}${tid}`;
}

/** "torsdag den 20. maj 2027 kl. 19.30" til mailen. */
function langDatoTid(s: ShowDate): string {
  const dato = daDateLong(s.date) || s.date;
  return s.time ? `${dato} kl. ${s.time.replace(":", ".")}` : dato;
}

const NOTE_FORMAT = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function tidspunkt(nu: Date): string {
  const d: Record<string, string> = {};
  for (const p of NOTE_FORMAT.formatToParts(nu)) d[p.type] = p.value;
  return `${d.day}-${d.month}-${d.year} kl. ${d.hour}.${d.minute}`;
}

/** Dagens dato i dansk tid som ÅÅÅÅ-MM-DD. */
function idagIso(nu: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(nu);
}

/** Det sidste sekund af dagen i dansk tid (tager højde for sommertid). */
export function slutPaaDagen(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const gaet = Date.UTC(y, m - 1, d, 23, 59, 59);
  const dele: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(gaet))) {
    dele[p.type] = p.value;
  }
  const lokal = Date.UTC(
    Number(dele.year),
    Number(dele.month) - 1,
    Number(dele.day),
    Number(dele.hour),
    Number(dele.minute),
    Number(dele.second)
  );
  return new Date(gaet - (lokal - gaet));
}

function stykpris(t: TicketTypeDef): number {
  return Number(t.price || 0) + Number(t.fee || 0);
}

/** Billettypen for en kategori i en prisgruppe. Foretrækker samme navn. */
function findType(
  typer: TicketTypeDef[],
  prisgruppe: string,
  kategori: Kapacitetskategori,
  foretrukketId?: string | null,
  foretrukketNavn?: string
): TicketTypeDef | null {
  const kandidater = typer.filter(
    (t) => t.priceGroup === prisgruppe && t.kapacitetskategori === kategori
  );
  if (foretrukketId) {
    const t = kandidater.find((k) => k.id === foretrukketId);
    if (t) return t;
  }
  if (foretrukketNavn) {
    const t = kandidater.find((k) => k.category === foretrukketNavn);
    if (t) return t;
  }
  return kandidater.length === 1 ? kandidater[0] : null;
}

export type Prisforskel =
  | {
      ok: true;
      forskelKr: number;
      ticketBreakdown: string;
      nyeBilletTyper: Partial<Record<Kapacitetskategori, string>>;
    }
  | { ok: false; error: string };

/**
 * Prisforskellen ved at flytte pladserne fra én prisgruppe til en anden:
 * (ny pris + gebyr − gammel pris + gebyr) pr. plads. Fribilletter giver 0 kr.
 * Prisen slås op i Airtable nu; det er de samme priser, som billetkøbet bruger.
 */
export function beregnPrisforskel(
  linjer: Pladslinje[],
  fra: ShowDate,
  til: ShowDate,
  typer: TicketTypeDef[]
): Prisforskel {
  let forskelKr = 0;
  const dele: string[] = [];
  const nyeBilletTyper: Partial<Record<Kapacitetskategori, string>> = {};
  const sorteret = [...linjer].sort(
    (a, b) => KAPACITETSKATEGORIER.indexOf(a.kategori) - KAPACITETSKATEGORIER.indexOf(b.kategori)
  );
  for (const l of sorteret) {
    const gammel = findType(typer, fra.priceGroup, l.kategori, l.ticketTypeId);
    const ny = findType(typer, til.priceGroup, l.kategori, null, gammel?.category);
    if (!ny) {
      return {
        ok: false,
        error: `Den nye dato har ingen billettype for ${KATEGORI_NAVN[l.kategori]}, så reservationen kan ikke flyttes dertil.`,
      };
    }
    if (l.kilde !== "fribillet") {
      if (!gammel) {
        return {
          ok: false,
          error: `Prisen for ${KATEGORI_NAVN[l.kategori]} på den gamle dato kan ikke findes, så prisforskellen kan ikke regnes ud.`,
        };
      }
      forskelKr += l.antal * (stykpris(ny) - stykpris(gammel));
    }
    dele.push(`${ny.category} x${l.antal}`);
    nyeBilletTyper[l.kategori] = ny.id;
  }
  return { ok: true, forskelKr: Math.round(forskelKr), ticketBreakdown: dele.join(", "), nyeBilletTyper };
}

function kr(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr.`;
}

function betalingsblok(beloebKr: number, link: string, udloeber: string): string {
  return `${fremhaevetFelt(
    `Den nye dato koster ${kr(beloebKr)} mere end den gamle. Betal forskellen med kort via knappen herunder. Linket gælder til ${escapeHtml(
      udloeber
    )}.`
  )}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 8px;">
        <tr><td align="center" bgcolor="${FARVER.groen}" style="background:${FARVER.groen};border-radius:4px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 30px;font-family:${SKRIFT};font-size:17px;line-height:22px;color:${FARVER.creme};text-decoration:none;font-weight:bold;">Betal med kort</a>
        </td></tr>
      </table>
      <p style="margin:0;text-align:center;font-family:${SKRIFT};font-size:13px;line-height:19px;color:${FARVER.daempet};word-break:break-all;">Virker knappen ikke, kan du kopiere linket ind i din browser: ${escapeHtml(
        link
      )}</p>`;
}

function tilgodeblok(beloebKr: number, kode: string, dato: string): string {
  return fremhaevetFelt(
    `Den nye dato er ${kr(beloebKr)} billigere end den gamle. Forskellen får du som en tilgodeseddel, du kan bruge i baren ${escapeHtml(
      dato
    )}. Vis koden i baren: <strong style="letter-spacing:1px;">${escapeHtml(kode)}</strong>`
  );
}

export async function flytBooking(
  deps: FlytDeps,
  bookingId: string,
  tilShowId: string
): Promise<FlytSvar> {
  const booking = await deps.hentBooking(bookingId);
  if (!booking) return { ok: false, status: 404, error: "Bookingen findes ikke." };
  const f = booking.fields;
  const bookingNo = tekst(f[FIELDS.booking.bookingNo]);
  if (tekst(f[FIELDS.booking.status]) !== "Betalt") {
    return { ok: false, status: 409, error: "Kun betalte bookinger kan flyttes." };
  }

  const fraShowId = foersteId(f[FIELDS.booking.show]);
  if (!tilShowId || tilShowId === fraShowId) {
    return { ok: false, status: 400, error: "Vælg en anden forestilling end den, bookingen har nu." };
  }
  const [fra, til] = await Promise.all([
    fraShowId ? deps.hentShow(fraShowId) : Promise.resolve(null),
    deps.hentShow(tilShowId),
  ]);
  if (!fra) return { ok: false, status: 409, error: "Bookingens nuværende forestilling kan ikke findes." };
  if (!til) return { ok: false, status: 404, error: "Den nye forestilling findes ikke." };
  const nu = deps.nu();
  if (til.date < idagIso(nu)) {
    return { ok: false, status: 400, error: "Den nye forestilling har allerede været." };
  }

  const linjer = (await hentPladslinjer(deps.db, bookingId)).filter((l) => l.showId === fra.id);
  if (linjer.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Bookingen har ingen pladser i pladsoptællingen, så den kan ikke flyttes her. Brug Annullér og en fribillet i stedet.",
    };
  }
  const pris = beregnPrisforskel(linjer, fra, til, await deps.hentBilletTyper());
  if (!pris.ok) return { ok: false, status: 409, error: pris.error };

  const flyt = await flytPladser(deps.db, {
    bookingId,
    fraShowId: fra.id,
    tilShowId: til.id,
    kapaciteter: kapaciteterFor(til.kapacitetsjustering ?? {}),
    nyeBilletTyper: pris.nyeBilletTyper,
  });
  if (!flyt.ok) {
    const m = flyt.mangler;
    return {
      ok: false,
      status: 409,
      error: m
        ? `Der er ikke plads på den nye dato. ${KATEGORI_NAVN[m.kategori]}: ${m.tilbage} tilbage, bookingen har ${m.oensket}. Intet er ændret.`
        : "Der er ikke plads på den nye dato. Intet er ændret.",
    };
  }

  const fraTekst = kortDatoTid(fra);
  const tilTekst = kortDatoTid(til);
  let note = tilfoejNote(
    tekst(f[FIELDS.booking.specialRequests]),
    `Flyttet fra ${fraTekst} til ${tilTekst} af personale ${tidspunkt(nu)}`
  );
  try {
    await deps.opdaterBooking(bookingId, {
      [FIELDS.booking.show]: [til.id],
      [FIELDS.booking.tableNumber]: "",
      [FIELDS.booking.gaestenummer]: null,
      [FIELDS.booking.varselSent]: false,
      [FIELDS.booking.ticketBreakdown]: pris.ticketBreakdown,
      [FIELDS.booking.specialRequests]: note,
    });
  } catch {
    deps.log("Flytning: Airtable kunne ikke opdateres, pladserne føres tilbage", { bookingNo });
    try {
      await flytPladser(deps.db, {
        bookingId,
        fraShowId: til.id,
        tilShowId: fra.id,
        kapaciteter: null,
        nyeBilletTyper: Object.fromEntries(linjer.filter((l) => l.ticketTypeId).map((l) => [l.kategori, l.ticketTypeId])),
      });
    } catch {
      deps.log("Flytning: pladserne kunne ikke føres tilbage", { bookingNo });
      return {
        ok: false,
        status: 502,
        error:
          "Airtable svarede ikke, og pladserne kunne ikke føres tilbage. Bookingen står stadig på den gamle dato i Airtable, men pladserne tælles på den nye. Kontakt udvikleren.",
      };
    }
    return {
      ok: false,
      status: 502,
      error: "Bookingen blev ikke flyttet, fordi Airtable ikke svarede. Intet er ændret. Prøv igen om lidt.",
    };
  }

  // Herfra er bookingen flyttet. Intet herunder må fortryde det.
  const advarsler: string[] = [];
  const kundeId = foersteId(f[FIELDS.booking.customer]);
  const kunde = kundeId ? await deps.hentKunde(kundeId).catch(() => null) : null;
  const kundeNavn = tekst(kunde?.fields[FIELDS.customer.name]);
  const kundeEmail = tekst(kunde?.fields[FIELDS.customer.email]).trim();

  let ekstraHtml = "";
  let ekstraNote = "";
  let paymentRef: string | undefined;
  let betalingslink: string | undefined;
  let tilgodeseddel: { kode: string; kr: number } | undefined;

  if (pris.forskelKr > 0) {
    const totalOre = pris.forskelKr * 100;
    try {
      const betaling = await deps.opretBetaling({
        orderId: bookingId,
        orderNumber: bookingNo,
        eventId: til.id,
        totalOre,
        currency: "dkk",
        description: `Bakkens Hvile · prisforskel · ${bookingNo}`,
        origin: deps.origin,
        expiresInMinutes: PRISFORSKEL_FRIST_MINUTTER,
        sourceCode: deps.sourceCode,
        tags: ["prisforskel", bookingId],
        merchantTrns: `${bookingNo} · prisforskel ved flytning`,
      });
      await createTicketPayment(deps.db, {
        paymentRef: betaling.paymentRef,
        flow: "prisforskel",
        bookingId,
        bookingNo,
        customerEmail: kundeEmail || null,
        customerName: kundeNavn || null,
        expectedTotalOre: totalOre,
        discountOre: 0,
        lineItems: [
          {
            description: `Prisforskel ved flytning til ${daDateShort(til.date) || til.date}`,
            quantity: 1,
            amountSubtotalOre: totalOre,
            kind: "ticket",
          },
        ],
      });
      paymentRef = betaling.paymentRef;
      betalingslink = betaling.redirectUrl;
      ekstraNote = `Prisforskel ${pris.forskelKr} kr. afventer betaling`;
      ekstraHtml = betalingsblok(
        pris.forskelKr,
        betaling.redirectUrl,
        udloebTekst(new Date(nu.getTime() + PRISFORSKEL_FRIST_MINUTTER * 60_000))
      );
    } catch {
      deps.log("Flytning: betalingslinket for prisforskellen kunne ikke oprettes", { bookingNo });
      ekstraNote = `Prisforskel ${pris.forskelKr} kr. mangler – betalingslink kunne ikke oprettes`;
      advarsler.push(
        `Betalingslinket for prisforskellen på ${pris.forskelKr} kr. kunne ikke oprettes. Opret en ekstrabillet eller opkræv beløbet på anden vis.`
      );
    }
  } else if (pris.forskelKr < 0) {
    const beloeb = -pris.forskelKr;
    try {
      const seddel = await opretTilgodeseddel(deps.db, {
        bookingNo,
        amountOre: beloeb * 100,
        kundeNavn,
        kundeEmail: kundeEmail || "ukendt",
        udloeber: slutPaaDagen(til.date),
      });
      tilgodeseddel = { kode: seddel.code, kr: beloeb };
      ekstraNote = `Tilgodeseddel ${beloeb} kr. udstedt (kode ${seddel.code})`;
      ekstraHtml = tilgodeblok(beloeb, seddel.code, daDateLong(til.date) ? `${daDateLong(til.date)}` : "på forestillingsdagen");
    } catch {
      deps.log("Flytning: tilgodesedlen kunne ikke udstedes", { bookingNo });
      ekstraNote = `Tilgodeseddel ${beloeb} kr. mangler – kunne ikke udstedes`;
      advarsler.push(
        `Tilgodesedlen på ${beloeb} kr. kunne ikke udstedes. Udsted et gavekort manuelt, eller giv kunden beløbet på anden vis.`
      );
    }
  }

  if (ekstraNote) {
    note = tilfoejNote(note, ekstraNote);
    try {
      await deps.opdaterBooking(bookingId, { [FIELDS.booking.specialRequests]: note });
    } catch {
      deps.log("Flytning: noten om prisforskel kunne ikke gemmes", { bookingNo });
      advarsler.push(`Noten "${ekstraNote}" kunne ikke gemmes på bookingen. Skriv den selv som note.`);
    }
  }

  let emailed = false;
  if (!kundeEmail) {
    advarsler.push("Kunden har ingen email, så der er ikke sendt en ny billet.");
  } else {
    try {
      await deps.sendMail({
        to: kundeEmail,
        subject: `Din reservation er flyttet til ${daDateShort(til.date) || til.date} – ${bookingNo}`,
        html: ticketEmailHtml({
          customerName: kundeNavn,
          bookingNo,
          showTitle: til.title,
          showDateIso: til.date,
          showTime: til.time,
          seats: pris.ticketBreakdown,
          isJubilee: showYear(til.date) === 2027,
          lineItems: [],
          subtotalKr: 0,
          discountKr: 0,
          totalKr: 0,
          discountLabel: "",
          flytning: {
            fraTekst: langDatoTid(fra),
            ekstraHtml:
              ekstraHtml ||
              fremhaevetFelt(
                "Bliver du selv forhindret, kan billetten ikke byttes eller refunderes, men den kan i stedet overdrages til tredjemand."
              ),
          },
        }),
      });
      emailed = true;
    } catch {
      deps.log("Flytning: den nye billet kunne ikke sendes", { bookingNo });
      advarsler.push("Den nye billet kunne ikke sendes. Brug Gensend billet på bordplanen.");
    }
  }

  deps.log("Booking flyttet af personale", { bookingNo, prisforskelKr: pris.forskelKr });
  return {
    ok: true,
    bookingNo,
    fra: fraTekst,
    til: tilTekst,
    prisforskelKr: pris.forskelKr,
    paymentRef,
    betalingslink,
    tilgodeseddel,
    emailed,
    advarsler,
  };
}
