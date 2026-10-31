// Ekstra betalte billetter fra admin (ud over kapaciteten).
//
// Personalet lægger billetter ind til en forestilling – også når en kategori
// eller hele forestillingen er udsolgt. Gæsten får et betalingslink fra Viva
// på mail og betaler selv. Betalingen oprettes præcis som et almindeligt
// billetkøb (kilde VIVA_SOURCE_CODE_TICKETS, flow "billet", tags
// ["billet", bookingId]), så den fælles webhook sender billet, kvittering og
// salgsmail uændret, når gæsten har betalt.
//
// Prisen beregnes kun her på serveren: pris + gebyr fra Airtable for
// forestillingens prisgruppe. Personalet kan ikke ændre den, og der kommer
// aldrig tilvalg med.
//
// Afhængighederne (Airtable, Viva, mail) sprøjtes ind, så forløbet kan testes
// uden at ramme de rigtige tjenester.

import type { Queryable } from "@/lib/db";
import type { ShowDate } from "@/lib/events";
import type { CreatePaymentInput, CreatePaymentResult } from "@/lib/payments/types";
import { FIELDS } from "@/lib/airtable";
import { generateBookingNo } from "@/lib/booking-no";
import { generateBookingKey } from "@/lib/genbestil";
import {
  KATEGORI_NAVN,
  kapaciteterFor,
  type Kapacitetskategori,
} from "@/lib/kapacitet";
import {
  frigivForBooking,
  frigivUdloebne,
  hentTagne,
  holdUdenLoft,
  knytBetalingsreference,
  type Pladsoenske,
  type Pladstal,
} from "@/lib/seat-holds";
import { createTicketPayment, type TicketLineItem } from "@/lib/ticket-payments";
import { validateTicketCheckout, type TicketTypeDef } from "@/lib/ticket-checkout";
import { ekstrabilletEmailHtml } from "@/lib/mail/ekstrabillet-email";
import { daDateShort } from "@/lib/ticket-email";

/** Hvor længe Vivas betalingslink gælder: 24 timer (86400 sek.). */
export const EKSTRA_BETALINGSFRIST_MINUTTER = 24 * 60;
/**
 * Pladserne holdes 5 minutter længere end linket, så en betaling i sidste
 * øjeblik ikke rammer "sen betaling", blot fordi webhooken kommer lidt efter.
 */
export const EKSTRA_HOLD_MINUTTER = EKSTRA_BETALINGSFRIST_MINUTTER + 5;

export const EKSTRA_STATUS_AFVENTER = "Ekstra – afventer betaling";
export const EKSTRA_STATUS_UDLOEBET = "Udløbet";
export const EKSTRA_PRAEFIKS = "BH-EKS-";

export interface EkstraDeps {
  db: Queryable;
  hentShow(showId: string): Promise<ShowDate | null>;
  hentBilletTyper(): Promise<TicketTypeDef[]>;
  opretKunde(fields: Record<string, unknown>): Promise<{ id: string }>;
  opretBooking(fields: Record<string, unknown>): Promise<{ id: string }>;
  opretBetaling(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  sendMail(m: { to: string; subject: string; html: string }): Promise<void>;
  /** VIVA_SOURCE_CODE_TICKETS – samme kilde som almindelige billetkøb. */
  sourceCode: string;
  origin: string;
  /** Til tests. */
  nu?: () => Date;
}

export interface EkstraInput {
  showId?: string;
  tickets?: { ticketTypeId: string; quantity: number }[];
  customer?: { name?: string; email?: string; phone?: string };
  note?: string;
  /** Sættes, når personalet har set advarslen om oversalg og bekræftet. */
  bekraeftOversalg?: boolean;
}

export type EkstraSvar =
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
      paymentRef: string;
      betalingslink: string;
      ticketBreakdown: string;
      totalKr: number;
      emailed: boolean;
    };

const WEEKDAYS_SHORT = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** Samme billetlinje-tekst som billetkøbet ("man 10. maj kl. 19:30"). */
function showLabelFor(show: ShowDate): string {
  const d = new Date(`${show.date}T00:00:00Z`);
  const datePart = isNaN(d.getTime())
    ? show.date
    : `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
  return show.time ? `${datePart} kl. ${show.time}` : datePart;
}

/** "søndag den 1. november kl. 12.05" i dansk tid. */
export function udloebTekst(tid: Date): string {
  const dele = Object.fromEntries(
    new Intl.DateTimeFormat("da-DK", {
      timeZone: "Europe/Copenhagen",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(tid)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return `${dele.weekday} den ${dele.day}. ${dele.month} kl. ${dele.hour}.${dele.minute}`;
}

/** Linjer til advarslen, når der ikke er plads nok. Tom liste = plads nok. */
export function oversalgsDetaljer(
  oensker: Pladsoenske[],
  tagne: Pladstal,
  kapaciteter: Record<Kapacitetskategori, number>
): string[] {
  return oensker
    .filter((o) => tagne[o.kategori] + o.antal > kapaciteter[o.kategori])
    .map((o) => {
      const tilbage = Math.max(0, kapaciteter[o.kategori] - tagne[o.kategori]);
      return `${KATEGORI_NAVN[o.kategori]}: ${tilbage} tilbage, du lægger ${o.antal} ind`;
    });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function opretEkstrabillet(
  deps: EkstraDeps,
  input: EkstraInput
): Promise<EkstraSvar> {
  const navn = String(input.customer?.name ?? "").trim();
  const email = String(input.customer?.email ?? "").trim();
  const telefon = String(input.customer?.phone ?? "").trim();
  const note = String(input.note ?? "").trim().slice(0, 200);
  if (!navn) return { ok: false, status: 400, error: "Gæstens navn er påkrævet." };
  if (!EMAIL_RE.test(email)) {
    return {
      ok: false,
      status: 400,
      error: "Skriv gæstens e-mail. Betalingslinket sendes dertil.",
    };
  }

  const show = input.showId ? await deps.hentShow(input.showId) : null;
  if (!show) return { ok: false, status: 404, error: "Forestillingen findes ikke." };

  // Kun id'er og antal bruges fra browseren. Pris og gebyr slås op her, og der
  // sendes bevidst ingen tilvalg med.
  const tickets = Array.isArray(input.tickets)
    ? input.tickets.map((t) => ({ ticketTypeId: t?.ticketTypeId, quantity: t?.quantity }))
    : [];
  const result = validateTicketCheckout(
    { tickets: tickets as { ticketTypeId: string; quantity: number }[], addons: [] },
    {
      show,
      ticketTypes: await deps.hentBilletTyper(),
      addons: [],
      discountActive: false,
      showLabel: showLabelFor(show),
      allowSoldOut: true,
    }
  );
  if (!result.ok) return { ok: false, status: result.status, error: result.error };

  const db = deps.db;
  const kapaciteter = kapaciteterFor(show.kapacitetsjustering ?? {});
  await frigivUdloebne(db, show.id);
  const tagne = await hentTagne(db, show.id);
  const detaljer = oversalgsDetaljer(result.pladsoensker, tagne, kapaciteter);
  if (detaljer.length > 0 && input.bekraeftOversalg !== true) {
    return {
      ok: false,
      status: 409,
      kraeverBekraeftelse: true,
      advarsel:
        "Der er ikke plads nok. Opretter du billetterne alligevel, bliver forestillingen overbooket, når gæsten betaler.",
      detaljer,
    };
  }

  const kunde = await deps.opretKunde({
    [FIELDS.customer.name]: navn,
    [FIELDS.customer.email]: email,
    [FIELDS.customer.phone]: telefon,
  });
  const bookingNo = generateBookingNo(EKSTRA_PRAEFIKS);
  const booking = await deps.opretBooking({
    [FIELDS.booking.bookingNo]: bookingNo,
    [FIELDS.booking.ticketCount]: result.totals.ticketCount,
    [FIELDS.booking.specialRequests]: note ? `Ekstrabillet – ${note}` : "Ekstrabillet",
    [FIELDS.booking.status]: EKSTRA_STATUS_AFVENTER,
    [FIELDS.booking.discount]: 0,
    [FIELDS.booking.customer]: [kunde.id],
    [FIELDS.booking.ticketBreakdown]: result.ticketBreakdown,
    [FIELDS.booking.key]: generateBookingKey(),
    [FIELDS.booking.show]: [show.id],
  });

  const ledgerLines: TicketLineItem[] = result.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    amountSubtotalOre: l.amountSubtotalOre,
    kind: l.kind,
  }));
  const totalOre = result.totals.totalOre;

  // Pladserne holdes først (uden loft – personalet har bekræftet). Går noget
  // galt, før linket er sendt, gives de tilbage med det samme.
  await holdUdenLoft(db, {
    showId: show.id,
    bookingId: booking.id,
    oensker: result.pladsoensker,
    holdMinutter: EKSTRA_HOLD_MINUTTER,
  });

  let betaling: CreatePaymentResult;
  try {
    betaling = await deps.opretBetaling({
      orderId: booking.id,
      orderNumber: bookingNo,
      eventId: show.id,
      totalOre,
      currency: "dkk",
      description: `Bakkens Hvile · billetter · ${bookingNo}`,
      origin: deps.origin,
      expiresInMinutes: EKSTRA_BETALINGSFRIST_MINUTTER,
      sourceCode: deps.sourceCode,
      tags: ["billet", booking.id],
      merchantTrns: `${bookingNo} · ekstra billetter`,
    });
    await createTicketPayment(db, {
      paymentRef: betaling.paymentRef,
      flow: "billet",
      bookingId: booking.id,
      bookingNo,
      customerEmail: email,
      customerName: navn,
      expectedTotalOre: totalOre,
      discountOre: 0,
      lineItems: ledgerLines,
    });
    await knytBetalingsreference(db, booking.id, betaling.paymentRef);
  } catch (err) {
    await frigivForBooking(db, booking.id);
    throw err;
  }

  const nu = deps.nu ? deps.nu() : new Date();
  const udloeber = udloebTekst(
    new Date(nu.getTime() + EKSTRA_BETALINGSFRIST_MINUTTER * 60_000)
  );
  let emailed = false;
  try {
    await deps.sendMail({
      to: email,
      subject: `Betal dine billetter til Bakkens Hvile ${daDateShort(show.date)} – ${bookingNo}`,
      html: ekstrabilletEmailHtml({
        kundeNavn: navn,
        bookingNo,
        showTitle: show.title,
        showDateIso: show.date,
        showTime: show.time,
        pladser: result.ticketBreakdown,
        linjer: ledgerLines,
        totalOre,
        betalingslink: betaling.redirectUrl,
        udloeber,
      }),
    });
    emailed = true;
  } catch {
    // Linket vises også for personalet, så det kan sendes på sms i stedet.
    console.error("Ekstrabillet: betalingsmailen kunne ikke sendes", { bookingNo });
  }

  return {
    ok: true,
    bookingId: booking.id,
    bookingNo,
    paymentRef: betaling.paymentRef,
    betalingslink: betaling.redirectUrl,
    ticketBreakdown: result.ticketBreakdown,
    totalKr: Math.round(totalOre / 100),
    emailed,
  };
}

/**
 * Hvilke af de givne bookinger er ekstrabilletter, hvis link er udløbet uden
 * betaling? Pladserne er da givet tilbage (status 'released'), og betalingen
 * står stadig som ubetalt. Bruges til at markere bookingen "Udløbet".
 */
export async function udloebneEkstrabilletter(
  db: Queryable,
  bookingIds: string[]
): Promise<string[]> {
  if (bookingIds.length === 0) return [];
  const { rows } = await db.query<{ booking_id: string }>(
    `SELECT DISTINCT h.booking_id
       FROM seat_holds h
       JOIN ticket_payments t ON t.payment_ref = h.payment_ref
      WHERE h.booking_id = ANY($1)
        AND h.source = 'ekstra'
        AND h.status = 'released'
        AND t.status IN ('pending', 'failed')`,
    [bookingIds]
  );
  return rows.map((r) => r.booking_id);
}
