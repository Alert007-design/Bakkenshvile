// Store selskaber med betalingsfrist (ejerens punkt 11, besluttet 01-11-2026).
//
// Forløb:
//  1. Personalet reserverer billetter med en sidste betalingsfrist. Pladserne
//     holdes i pladsbogen med kilden 'selskab' og uden udløbstid. Kunden får en
//     mail med et link til selskabets betalingsside.
//  2. På betalingssiden kan kunden tilføje drikkevarer (onlinerabat som ved
//     almindeligt køb). Viva-betalingen oprettes først ved klik, så linket aldrig
//     udløber. Betalingen er et almindeligt billetkøb (flow "billet"), og den
//     fælles webhook gør bookingen betalt og sender billetten.
//  3. Betaler selskabet på faktura, markerer personalet bookingen betalt.
//  4. Det daglige job sender en påmindelse 3 dage før fristen og annullerer
//     ubetalte reservationer dagen efter fristen — det sidste kun, når den
//     automatiske annullering er slået til.
//
// Alle beløb beregnes på serveren ud fra Airtable-priserne. Afhængighederne
// sprøjtes ind, så forløbet kan testes uden Airtable, Viva og mail.

import type { Queryable } from "@/lib/db";
import type { ShowDate } from "@/lib/events";
import type { AirtableRecord } from "@/lib/airtable";
import { FIELDS } from "@/lib/airtable";
import type { CreatePaymentInput, CreatePaymentResult } from "@/lib/payments/types";
import { generateBookingNo } from "@/lib/booking-no";
import { generateBookingKey } from "@/lib/genbestil";
import { kapaciteterFor } from "@/lib/kapacitet";
import {
  frigivForBooking,
  frigivUdloebne,
  hentTagne,
  holdUdenLoft,
  knytBetalingsreference,
  markerSolgtForBooking,
} from "@/lib/seat-holds";
import { createTicketPayment, type TicketLineItem } from "@/lib/ticket-payments";
import {
  validateTicketCheckout,
  type AddonDef,
  type TicketCheckoutLine,
  type TicketTypeDef,
} from "@/lib/ticket-checkout";
import { oversalgsDetaljer } from "@/lib/ekstrabillet";
import {
  selskabAnnulleretHtml,
  selskabAnnulleretInternHtml,
  selskabInvitationHtml,
  selskabPaamindelseHtml,
  type SelskabMailParams,
} from "@/lib/mail/selskab-email";
import { daDateShort } from "@/lib/ticket-email";

import { SELSKAB_PRAEFIKS, SELSKAB_STATUS } from "@/lib/selskab-konstanter";
export { SELSKAB_PRAEFIKS, SELSKAB_STATUS };
/** Hvor længe ét betalingsforsøg hos Viva gælder. Linket i mailen udløber ikke. */
export const SELSKAB_BETALING_MINUTTER = 30;
/** Påmindelsen sendes så mange dage før fristen. */
export const PAAMINDELSE_DAGE_FOER = 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATO_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BilletValg {
  ticketTypeId: string;
  quantity: number;
}

export interface SelskabRaekke {
  bookingId: string;
  bookingNo: string;
  showId: string;
  tickets: BilletValg[];
  /** ÅÅÅÅ-MM-DD */
  deadline: string;
  customerEmail: string;
  customerName: string;
  reminderSentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
}

// ---------------------------------------------------------------------------
// Database

type Raa = {
  booking_id: string;
  booking_no: string;
  show_id: string;
  tickets: unknown;
  deadline: string | Date;
  customer_email: string;
  customer_name: string;
  reminder_sent_at: string | Date | null;
  paid_at: string | Date | null;
  cancelled_at: string | Date | null;
};

function datoTekst(v: string | Date): string {
  if (v instanceof Date) {
    // DATE-kolonner kommer som midnat i serverens tidszone; tag kalenderdagen.
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

function tidTekst(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function tilRaekke(r: Raa): SelskabRaekke {
  const tickets = typeof r.tickets === "string" ? JSON.parse(r.tickets) : r.tickets;
  return {
    bookingId: r.booking_id,
    bookingNo: r.booking_no,
    showId: r.show_id,
    tickets: Array.isArray(tickets) ? (tickets as BilletValg[]) : [],
    deadline: datoTekst(r.deadline),
    customerEmail: r.customer_email,
    customerName: r.customer_name,
    reminderSentAt: tidTekst(r.reminder_sent_at),
    paidAt: tidTekst(r.paid_at),
    cancelledAt: tidTekst(r.cancelled_at),
  };
}

const KOLONNER = `booking_id, booking_no, show_id, tickets, deadline::text AS deadline,
  customer_email, customer_name, reminder_sent_at, paid_at, cancelled_at`;

export async function hentSelskab(db: Queryable, bookingId: string): Promise<SelskabRaekke | null> {
  const { rows } = await db.query<Raa>(
    `SELECT ${KOLONNER} FROM group_reservations WHERE booking_id = $1`,
    [bookingId]
  );
  return rows[0] ? tilRaekke(rows[0]) : null;
}

export async function hentSelskabEfterNr(db: Queryable, bookingNo: string): Promise<SelskabRaekke | null> {
  const { rows } = await db.query<Raa>(
    `SELECT ${KOLONNER} FROM group_reservations WHERE booking_no = $1`,
    [bookingNo]
  );
  return rows[0] ? tilRaekke(rows[0]) : null;
}

/** Alle selskaber, nyeste frist sidst. `kunAabne` = hverken betalt eller annulleret. */
export async function listSelskaber(db: Queryable, kunAabne = false): Promise<SelskabRaekke[]> {
  const { rows } = await db.query<Raa>(
    `SELECT ${KOLONNER} FROM group_reservations
      ${kunAabne ? "WHERE paid_at IS NULL AND cancelled_at IS NULL" : ""}
      ORDER BY deadline, booking_no`
  );
  return rows.map(tilRaekke);
}

/** Webhooken kalder denne ved enhver betalt billet; uskadelig for andre bookinger. */
export async function markerSelskabBetalt(db: Queryable, bookingId: string): Promise<boolean> {
  const { rows } = await db.query<{ booking_id: string }>(
    `UPDATE group_reservations SET paid_at = COALESCE(paid_at, now())
      WHERE booking_id = $1 RETURNING booking_id`,
    [bookingId]
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Fælles hjælpere

const UGEDAGE = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** Samme billetlinje-tekst som billetkøbet ("man 10. maj kl. 19:30"). */
export function showLabel(show: ShowDate): string {
  const d = new Date(`${show.date}T00:00:00Z`);
  const datePart = isNaN(d.getTime())
    ? show.date
    : `${UGEDAGE[d.getUTCDay()]} ${d.getUTCDate()}. ${MAANEDER[d.getUTCMonth()]}`;
  return show.time ? `${datePart} kl. ${show.time}` : datePart;
}

/** Dato + n dage (ÅÅÅÅ-MM-DD). */
export function plusDage(dato: string, n: number): string {
  const d = new Date(`${dato}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Store selskaber må gerne købe flere billetter end billettypens "Max antal".
function utenMaks(typer: TicketTypeDef[]): TicketTypeDef[] {
  return typer.map((t) => ({ ...t, maxCount: Math.max(t.maxCount || 0, 1000) }));
}

function tilLedger(lines: TicketCheckoutLine[]): TicketLineItem[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    amountSubtotalOre: l.amountSubtotalOre,
    kind: l.kind,
  }));
}

interface BeregnDeps {
  hentShow(showId: string): Promise<ShowDate | null>;
  hentBilletTyper(): Promise<TicketTypeDef[]>;
}

/** Billetlinjer og -beløb for et selskab (uden drikkevarer) til mails og sider. */
async function billetterFor(
  deps: BeregnDeps,
  raekke: SelskabRaekke
): Promise<{ show: ShowDate; linjer: TicketLineItem[]; billetterOre: number; pladser: string } | null> {
  const show = await deps.hentShow(raekke.showId);
  if (!show) return null;
  const r = validateTicketCheckout(
    { tickets: raekke.tickets, addons: [] },
    {
      show,
      ticketTypes: utenMaks(await deps.hentBilletTyper()),
      addons: [],
      discountActive: false,
      showLabel: showLabel(show),
      today: "0000-01-01",
      allowSoldOut: true,
    }
  );
  if (!r.ok) return null;
  return {
    show,
    linjer: tilLedger(r.lines),
    billetterOre: r.totals.totalOre,
    pladser: r.ticketBreakdown,
  };
}

export function betalingssideLink(origin: string, bookingNo: string, noegle: string): string {
  return `${origin}/selskab/${encodeURIComponent(bookingNo)}?k=${encodeURIComponent(noegle)}`;
}

function sikkerLig(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// 1. Opret

export interface OpretDeps extends BeregnDeps {
  db: Queryable;
  opretKunde(fields: Record<string, unknown>): Promise<{ id: string }>;
  opretBooking(fields: Record<string, unknown>): Promise<{ id: string }>;
  sendMail(m: { to: string; subject: string; html: string }): Promise<void>;
  origin: string;
  /** Dagens dato i dansk tid (ÅÅÅÅ-MM-DD). */
  idag: string;
  nu?: () => Date;
}

export interface OpretInput {
  showId?: string;
  tickets?: BilletValg[];
  customer?: { name?: string; email?: string; phone?: string; company?: string };
  frist?: string;
  note?: string;
  /** Sat, når personalet har set advarslen om, at der ikke er plads nok. */
  bekraeftOversalg?: boolean;
}

export type OpretSvar =
  | {
      ok: false;
      status: number;
      error?: string;
      kraeverBekraeftelse?: boolean;
      advarsel?: string;
      detaljer?: string[];
    }
  | {
      ok: true;
      bookingId: string;
      bookingNo: string;
      betalingsside: string;
      ticketBreakdown: string;
      billetterKr: number;
      emailed: boolean;
    };

export async function opretSelskab(deps: OpretDeps, input: OpretInput): Promise<OpretSvar> {
  const navn = String(input.customer?.name ?? "").trim();
  const email = String(input.customer?.email ?? "").trim();
  const telefon = String(input.customer?.phone ?? "").trim();
  const firma = String(input.customer?.company ?? "").trim();
  const note = String(input.note ?? "").trim().slice(0, 300);
  const frist = String(input.frist ?? "").trim();

  if (!navn) return { ok: false, status: 400, error: "Kundens navn er påkrævet." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "Skriv kundens e-mail. Linket til betaling sendes dertil." };
  }
  const show = input.showId ? await deps.hentShow(input.showId) : null;
  if (!show) return { ok: false, status: 404, error: "Forestillingen findes ikke." };
  if (!DATO_RE.test(frist)) return { ok: false, status: 400, error: "Vælg en sidste betalingsfrist." };
  if (frist < deps.idag) return { ok: false, status: 400, error: "Betalingsfristen kan ikke ligge før i dag." };
  if (frist > show.date) {
    return { ok: false, status: 400, error: "Betalingsfristen skal ligge senest på forestillingsdagen." };
  }

  const tickets = Array.isArray(input.tickets)
    ? input.tickets
        .map((t) => ({ ticketTypeId: String(t?.ticketTypeId ?? ""), quantity: Number(t?.quantity) }))
        .filter((t) => t.ticketTypeId && Number.isInteger(t.quantity) && t.quantity > 0)
    : [];
  const result = validateTicketCheckout(
    { tickets, addons: [] },
    {
      show,
      ticketTypes: utenMaks(await deps.hentBilletTyper()),
      addons: [],
      discountActive: false,
      showLabel: showLabel(show),
      today: deps.idag,
      allowSoldOut: true,
    }
  );
  if (!result.ok) return { ok: false, status: result.status, error: result.error };

  const db = deps.db;
  await frigivUdloebne(db, show.id);
  const detaljer = oversalgsDetaljer(
    result.pladsoensker,
    await hentTagne(db, show.id),
    kapaciteterFor(show.kapacitetsjustering ?? {})
  );
  if (detaljer.length > 0 && input.bekraeftOversalg !== true) {
    return {
      ok: false,
      status: 409,
      kraeverBekraeftelse: true,
      advarsel:
        "Der er ikke plads nok efter det almindelige system. Opretter du reservationen alligevel, bliver forestillingen overbooket i de nævnte kategorier.",
      detaljer,
    };
  }

  const kunde = await deps.opretKunde({
    [FIELDS.customer.name]: navn,
    [FIELDS.customer.email]: email,
    [FIELDS.customer.phone]: telefon,
    ...(firma ? { [FIELDS.customer.company]: firma } : {}),
  });
  const bookingNo = generateBookingNo(SELSKAB_PRAEFIKS);
  const noegle = generateBookingKey();
  const nu = deps.nu ? deps.nu() : new Date();
  const booking = await deps.opretBooking({
    [FIELDS.booking.bookingNo]: bookingNo,
    [FIELDS.booking.ticketCount]: result.totals.ticketCount,
    [FIELDS.booking.specialRequests]: note,
    [FIELDS.booking.status]: SELSKAB_STATUS,
    [FIELDS.booking.discount]: 0,
    [FIELDS.booking.customer]: [kunde.id],
    [FIELDS.booking.ticketBreakdown]: result.ticketBreakdown,
    [FIELDS.booking.key]: noegle,
    [FIELDS.booking.show]: [show.id],
    [FIELDS.booking.bestilt]: nu.toISOString(),
    [FIELDS.booking.betalingsfrist]: frist,
  });

  await holdUdenLoft(db, {
    showId: show.id,
    bookingId: booking.id,
    oensker: result.pladsoensker,
    holdMinutter: null,
    kilde: "selskab",
  });
  try {
    await db.query(
      `INSERT INTO group_reservations
         (booking_id, booking_no, show_id, tickets, deadline, customer_email, customer_name)
       VALUES ($1, $2, $3, $4::jsonb, $5::date, $6, $7)`,
      [booking.id, bookingNo, show.id, JSON.stringify(tickets), frist, email, navn]
    );
  } catch (err) {
    await frigivForBooking(db, booking.id);
    throw err;
  }

  const betalingsside = betalingssideLink(deps.origin, bookingNo, noegle);
  const mailParams: SelskabMailParams = {
    kundeNavn: navn,
    bookingNo,
    showTitle: show.title,
    showDateIso: show.date,
    showTime: show.time,
    pladser: result.ticketBreakdown,
    linjer: tilLedger(result.lines),
    billetterOre: result.totals.totalOre,
    fristIso: frist,
    betalingsside,
  };
  let emailed = false;
  try {
    await deps.sendMail({
      to: email,
      subject: `Jeres pladser i Bakkens Hvile ${daDateShort(show.date)} er reserveret – ${bookingNo}`,
      html: selskabInvitationHtml(mailParams),
    });
    emailed = true;
  } catch {
    console.error("Selskab: mailen med betalingslink kunne ikke sendes", { bookingNo });
  }

  return {
    ok: true,
    bookingId: booking.id,
    bookingNo,
    betalingsside,
    ticketBreakdown: result.ticketBreakdown,
    billetterKr: Math.round(result.totals.totalOre / 100),
    emailed,
  };
}

// ---------------------------------------------------------------------------
// 2. Kundens betalingsside

export interface SideDeps extends BeregnDeps {
  db: Queryable;
  findBooking(bookingNo: string): Promise<AirtableRecord | null>;
  hentTilvalg(): Promise<AddonDef[]>;
  /** Er onlinerabatten aktiv for forestillingsdatoen? */
  rabatAktiv(showDateIso: string): boolean;
  idag: string;
}

export type SideTilstand = "aaben" | "betalt" | "annulleret" | "frist_overskredet";

export interface SideVisning {
  tilstand: SideTilstand;
  bookingNo: string;
  kundeNavn: string;
  showTitle: string;
  showDateIso: string;
  showTime: string;
  frist: string;
  linjer: TicketLineItem[];
  billetterOre: number;
  rabatAktiv: boolean;
  tilvalg: AddonDef[];
}

/** Godkender linket og samler det, kundens betalingsside skal vise. */
async function godkend(
  deps: SideDeps,
  bookingNo: string,
  noegle: string
): Promise<{ raekke: SelskabRaekke; booking: AirtableRecord } | null> {
  const raekke = await hentSelskabEfterNr(deps.db, bookingNo);
  if (!raekke) return null;
  const booking = await deps.findBooking(bookingNo);
  if (!booking || booking.id !== raekke.bookingId) return null;
  const gemt = String(booking.fields[FIELDS.booking.key] ?? "");
  return sikkerLig(gemt, noegle) ? { raekke, booking } : null;
}

function tilstandFor(raekke: SelskabRaekke, booking: AirtableRecord, idag: string): SideTilstand {
  const status = String(booking.fields[FIELDS.booking.status] ?? "");
  if (raekke.paidAt || status === "Betalt") return "betalt";
  if (raekke.cancelledAt || status === "Annulleret") return "annulleret";
  if (raekke.deadline < idag) return "frist_overskredet";
  return "aaben";
}

export async function hentSideVisning(
  deps: SideDeps,
  bookingNo: string,
  noegle: string
): Promise<SideVisning | null> {
  const g = await godkend(deps, bookingNo, noegle);
  if (!g) return null;
  const b = await billetterFor(deps, g.raekke);
  if (!b) return null;
  return {
    tilstand: tilstandFor(g.raekke, g.booking, deps.idag),
    bookingNo: g.raekke.bookingNo,
    kundeNavn: g.raekke.customerName,
    showTitle: b.show.title,
    showDateIso: b.show.date,
    showTime: b.show.time,
    frist: g.raekke.deadline,
    linjer: b.linjer,
    billetterOre: b.billetterOre,
    rabatAktiv: deps.rabatAktiv(b.show.date),
    tilvalg: await deps.hentTilvalg(),
  };
}

export interface BetalDeps extends SideDeps {
  opretBetaling(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  sourceCode: string;
  origin: string;
}

export type BetalSvar = { ok: true; url: string } | { ok: false; status: number; error: string };

const IKKE_FUNDET = "Linket er ikke gyldigt. Kontakt os, så sender vi et nyt.";

export async function startBetaling(
  deps: BetalDeps,
  input: { bookingNo?: string; noegle?: string; addons?: { addonId: string; quantity: number }[] }
): Promise<BetalSvar> {
  const g = await godkend(deps, String(input.bookingNo ?? ""), String(input.noegle ?? ""));
  if (!g) return { ok: false, status: 404, error: IKKE_FUNDET };
  const tilstand = tilstandFor(g.raekke, g.booking, deps.idag);
  if (tilstand === "betalt") return { ok: false, status: 409, error: "Billetterne er allerede betalt." };
  if (tilstand === "annulleret") return { ok: false, status: 410, error: "Reservationen er annulleret." };
  if (tilstand === "frist_overskredet") {
    return { ok: false, status: 410, error: "Fristen for betaling er overskredet. Kontakt os, hvis I stadig vil komme." };
  }

  const show = await deps.hentShow(g.raekke.showId);
  if (!show) return { ok: false, status: 404, error: IKKE_FUNDET };
  const addons = Array.isArray(input.addons)
    ? input.addons
        .map((a) => ({ addonId: String(a?.addonId ?? ""), quantity: Number(a?.quantity) }))
        .filter((a) => a.addonId && Number.isInteger(a.quantity) && a.quantity > 0)
    : [];
  const result = validateTicketCheckout(
    { tickets: g.raekke.tickets, addons },
    {
      show,
      ticketTypes: utenMaks(await deps.hentBilletTyper()),
      addons: await deps.hentTilvalg(),
      discountActive: deps.rabatAktiv(show.date),
      showLabel: showLabel(show),
      today: deps.idag,
      allowSoldOut: true,
    }
  );
  if (!result.ok) return { ok: false, status: result.status, error: result.error };

  const ledger = tilLedger(result.lines);
  const betaling = await deps.opretBetaling({
    orderId: g.raekke.bookingId,
    orderNumber: g.raekke.bookingNo,
    eventId: show.id,
    totalOre: result.totals.totalOre,
    currency: "dkk",
    description: `Bakkens Hvile · billetter · ${g.raekke.bookingNo}`,
    origin: deps.origin,
    expiresInMinutes: SELSKAB_BETALING_MINUTTER,
    sourceCode: deps.sourceCode,
    tags: ["billet", g.raekke.bookingId],
    merchantTrns: `${g.raekke.bookingNo} · selskab`,
  });
  await createTicketPayment(deps.db, {
    paymentRef: betaling.paymentRef,
    flow: "billet",
    bookingId: g.raekke.bookingId,
    bookingNo: g.raekke.bookingNo,
    customerEmail: g.raekke.customerEmail,
    customerName: g.raekke.customerName,
    expectedTotalOre: result.totals.totalOre,
    discountOre: result.totals.discountOre,
    lineItems: ledger,
  });
  // Pladserne følger det nyeste betalingsforsøg. Betales et ældre forsøg,
  // markerer webhooken pladserne solgt via bookingen i stedet.
  await knytBetalingsreference(deps.db, g.raekke.bookingId, betaling.paymentRef);
  return { ok: true, url: betaling.redirectUrl };
}

/** Drikkevarerne fra en betalt bestilling, som tekst til bookingens tilvalgsfelt. */
export function tilvalgstekst(linjer: TicketLineItem[]): string {
  return linjer
    .filter((l) => l.kind === "addon")
    .map((l) => `${l.description} x${l.quantity}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// 3. Faktura

export interface FakturaDeps extends BeregnDeps {
  db: Queryable;
  opdaterBooking(id: string, fields: Record<string, unknown>): Promise<void>;
  /** Sender billetten til kunden, som ved en almindelig betaling. */
  sendBillet(p: {
    email: string;
    navn: string;
    bookingNo: string;
    show: ShowDate;
    pladser: string;
    linjer: TicketLineItem[];
    totalOre: number;
  }): Promise<void>;
  /** Besked til kontoret om, at reservationen er betalt på faktura. */
  meldTilKontoret(p: { bookingNo: string; navn: string; email: string; totalOre: number; show: ShowDate; pladser: string }): Promise<void>;
}

export type FakturaSvar = { ok: true } | { ok: false; status: number; error: string };

export async function markerBetaltFaktura(deps: FakturaDeps, bookingId: string): Promise<FakturaSvar> {
  const raekke = await hentSelskab(deps.db, bookingId);
  if (!raekke) return { ok: false, status: 404, error: "Bookingen er ikke et stort selskab." };
  if (raekke.paidAt) return { ok: false, status: 409, error: "Reservationen er allerede betalt." };
  if (raekke.cancelledAt) return { ok: false, status: 410, error: "Reservationen er annulleret." };
  const b = await billetterFor(deps, raekke);
  if (!b) return { ok: false, status: 500, error: "Billetterne kunne ikke beregnes." };

  await markerSolgtForBooking(deps.db, bookingId);
  await deps.opdaterBooking(bookingId, {
    [FIELDS.booking.status]: "Betalt",
    [FIELDS.booking.totalPaid]: Math.round(b.billetterOre / 100),
  });
  await markerSelskabBetalt(deps.db, bookingId);
  try {
    await deps.sendBillet({
      email: raekke.customerEmail,
      navn: raekke.customerName,
      bookingNo: raekke.bookingNo,
      show: b.show,
      pladser: b.pladser,
      linjer: b.linjer,
      totalOre: b.billetterOre,
    });
  } catch {
    console.error("Selskab: billetten kunne ikke sendes efter faktura", { bookingNo: raekke.bookingNo });
  }
  try {
    await deps.meldTilKontoret({
      bookingNo: raekke.bookingNo,
      navn: raekke.customerName,
      email: raekke.customerEmail,
      totalOre: b.billetterOre,
      show: b.show,
      pladser: b.pladser,
    });
  } catch {
    console.error("Selskab: kontoret kunne ikke få besked om faktura", { bookingNo: raekke.bookingNo });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4. Daglig kørsel: påmindelser og annullering

export interface FristDeps extends BeregnDeps {
  db: Queryable;
  hentBooking(id: string): Promise<AirtableRecord | null>;
  opdaterBooking(id: string, fields: Record<string, unknown>): Promise<void>;
  sendMail(m: { to: string; subject: string; html: string }): Promise<void>;
  origin: string;
  idag: string;
  /** Kontorets adresse til besked om annulleringer. */
  kontorMail: string;
  /** Slået til med miljøvariablen SELSKAB_AUTO_ANNULLERING=true. */
  autoAnnuller: boolean;
}

export interface FristResultat {
  paamindelser: number;
  annulleret: number;
  /** Ubetalte med overskredet frist, der IKKE er annulleret (slået fra). */
  overskredet: string[];
  fejl: number;
}

export async function koerFrister(deps: FristDeps): Promise<FristResultat> {
  const ud: FristResultat = { paamindelser: 0, annulleret: 0, overskredet: [], fejl: 0 };
  for (const raekke of await listSelskaber(deps.db, true)) {
    try {
      const booking = await deps.hentBooking(raekke.bookingId);
      if (!booking) continue;
      const status = String(booking.fields[FIELDS.booking.status] ?? "");
      // Er bookingen gjort betalt eller annulleret direkte i Airtable, følger
      // vi det og rører den ikke.
      if (status === "Betalt") {
        await markerSelskabBetalt(deps.db, raekke.bookingId);
        continue;
      }
      if (status === "Annulleret") {
        await deps.db.query(
          `UPDATE group_reservations SET cancelled_at = COALESCE(cancelled_at, now()) WHERE booking_id = $1`,
          [raekke.bookingId]
        );
        continue;
      }

      const overskredet = raekke.deadline < deps.idag;
      const paamindelsesdag = plusDage(raekke.deadline, -PAAMINDELSE_DAGE_FOER);
      if (!overskredet && raekke.reminderSentAt === null && deps.idag >= paamindelsesdag) {
        const p = await mailParams(deps, raekke, booking);
        if (!p) continue;
        await deps.sendMail({
          to: raekke.customerEmail,
          subject: `Husk at betale jeres billetter til Bakkens Hvile – ${raekke.bookingNo}`,
          html: selskabPaamindelseHtml(p),
        });
        await deps.db.query(
          `UPDATE group_reservations SET reminder_sent_at = now() WHERE booking_id = $1`,
          [raekke.bookingId]
        );
        ud.paamindelser++;
        continue;
      }

      if (overskredet) {
        if (!deps.autoAnnuller) {
          ud.overskredet.push(raekke.bookingNo);
          continue;
        }
        await frigivForBooking(deps.db, raekke.bookingId);
        await deps.opdaterBooking(raekke.bookingId, { [FIELDS.booking.status]: "Annulleret" });
        await deps.db.query(
          `UPDATE group_reservations SET cancelled_at = now() WHERE booking_id = $1`,
          [raekke.bookingId]
        );
        ud.annulleret++;
        const p = await mailParams(deps, raekke, booking);
        if (p) {
          try {
            await deps.sendMail({
              to: raekke.customerEmail,
              subject: `Jeres reservation i Bakkens Hvile er annulleret – ${raekke.bookingNo}`,
              html: selskabAnnulleretHtml(p),
            });
          } catch {
            console.error("Selskab: annulleringsmail til kunden fejlede", { bookingNo: raekke.bookingNo });
          }
          try {
            await deps.sendMail({
              to: deps.kontorMail,
              subject: `Reservation annulleret – ${raekke.bookingNo} (${raekke.customerName})`,
              html: selskabAnnulleretInternHtml({ ...p, kundeEmail: raekke.customerEmail }),
            });
          } catch {
            console.error("Selskab: besked til kontoret om annullering fejlede", { bookingNo: raekke.bookingNo });
          }
        }
      }
    } catch (err) {
      ud.fejl++;
      console.error("Selskab: fristkørsel fejlede for en reservation", { bookingNo: raekke.bookingNo });
    }
  }
  return ud;
}

async function mailParams(
  deps: FristDeps,
  raekke: SelskabRaekke,
  booking: AirtableRecord
): Promise<SelskabMailParams | null> {
  const b = await billetterFor(deps, raekke);
  if (!b) return null;
  return {
    kundeNavn: raekke.customerName,
    bookingNo: raekke.bookingNo,
    showTitle: b.show.title,
    showDateIso: b.show.date,
    showTime: b.show.time,
    pladser: b.pladser,
    linjer: b.linjer,
    billetterOre: b.billetterOre,
    fristIso: raekke.deadline,
    betalingsside: betalingssideLink(
      deps.origin,
      raekke.bookingNo,
      String(booking.fields[FIELDS.booking.key] ?? "")
    ),
  };
}
