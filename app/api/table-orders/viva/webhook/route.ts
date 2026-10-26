// Vivas FÆLLES webhook for hele sitet (Viva er eneste betalingsudbyder).
//
// Viva sender alle transaktioner på kontoen til det samme endpoint, så vi
// dirigerer ud fra transaktionens første tag: "billet" / "genbestil" /
// "bordbestilling".
//
// Vigtige forudsætninger:
//  - Viva SIGNERER IKKE sine webhooks. Payloaden må derfor ALDRIG bruges som
//    kilde til beløb, status eller reference — vi henter altid transaktionen hos
//    Viva og bruger kun det svar (inkl. tags).
//  - Adgang beskyttes med en delt hemmelighed i URL'en (?k=), som skal matche
//    VIVA_WEBHOOK_TOKEN (timing-safe). Ukendt/manglende → 404.
//  - Vivas orderCode er 16 cifre og læses som streng (aldrig som JavaScript-tal).
//  - Fail-closed: er noget uafklaret, ændres intet.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getDb } from "@/lib/db";
import {
  markOrderFailedByRef,
  markOrderPaidByRef,
  markOrderRefundedByRef,
} from "@/lib/orders";
import {
  getTicketPayment,
  markTicketFailedByRef,
  markTicketPaidByRef,
  markTicketRefundedByRef,
  revertTicketPaidByRef,
  type TicketPaymentRow,
} from "@/lib/ticket-payments";
import {
  getGiftCardByRef,
  markGiftCardFailedByRef,
  markGiftCardPaidByRef,
  markGiftCardRefundedByRef,
  revertGiftCardPaidByRef,
  type GiftCardRow,
} from "@/lib/gift-cards";
import {
  giftCardPurchaserEmailHtml,
  giftCardRecipientEmailHtml,
} from "@/lib/gift-card-email";
import { verifiedFromTransaction } from "@/lib/payments/viva";
import {
  getVivaWebhookKey,
  extractOrderCode,
  retrieveVivaTransaction,
} from "@/lib/payments/viva-client";
import { getRecord, updateRecord, TABLES, FIELDS } from "@/lib/airtable";
import { buildBookingView } from "@/lib/genbestil";
import { fulfillGenbestilling } from "@/lib/genbestil-fulfill";
import { advarOmBeloebsfejl } from "@/lib/payment-alerts";
import { ticketEmailHtml, daDateShort, showYear } from "@/lib/ticket-email";
import { orderEmailHtml } from "@/lib/order-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import { sendMail, EMAIL_REPLY_TO } from "@/lib/resend";
import { frigivReservation, hentTagne, markerSolgt } from "@/lib/seat-holds";
import {
  KAPACITETSKATEGORIER,
  KATEGORI_NAVN,
  kapaciteterFor,
} from "@/lib/kapacitet";
import { getShowDate } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vivas event-typer vi reagerer på.
const EVENT_PAYMENT_FAILED = 1798;
const EVENT_TRANSACTION_REVERSAL = 1797;

/** Timing-safe sammenligning af to strenge (undgår at lække via svartid). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Delt hemmelighed i ?k= skal matche VIVA_WEBHOOK_TOKEN. Ellers 404. */
function keyValid(req: NextRequest): boolean {
  const provided = req.nextUrl.searchParams.get("k") ?? "";
  const expected = process.env.VIVA_WEBHOOK_TOKEN ?? "";
  if (!expected) return false;
  return safeEqual(provided, expected);
}

/**
 * GET — Vivas verifikations-handshake. Viva forventer { "Key": "<nøglen>" }.
 * Vi henter nøglen hos Viva med Basic auth og svarer med den.
 */
export async function GET(req: NextRequest) {
  if (!keyValid(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const key = await getVivaWebhookKey();
    return NextResponse.json({ Key: key });
  } catch (err) {
    console.error("Viva-webhook: kunne ikke hente verifikationsnøgle");
    return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
  }
}

/** POST — et Viva-event. */
export async function POST(req: NextRequest) {
  if (!keyValid(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const raw = await req.text();
  let parsed: { EventTypeId?: number; EventData?: { TransactionId?: string } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: true });
  }

  const eventTypeId = Number(parsed?.EventTypeId);
  const transactionId = parsed?.EventData?.TransactionId;
  const orderCode = extractOrderCode(raw);

  // Mangler transaktion eller orderCode: kvittér 200 uden at gøre noget.
  if (!transactionId || typeof transactionId !== "string" || !orderCode) {
    return NextResponse.json({ received: true });
  }

  try {
    // Hent ALTID transaktionen hos Viva og brug kun det svar (usigneret payload).
    const txn = await retrieveVivaTransaction(transactionId);
    if (!txn) {
      return NextResponse.json({ received: true }); // ukendt transaktion
    }

    const db = getDb();
    const verified = verifiedFromTransaction(txn);

    // Gavekort har sin egen ledger. Findes referencen dér, håndteres den her og
    // routes ALDRIG videre til billet/bord. Placeret før billet-opslaget, så en
    // gavekort-reference ikke fejlagtigt lander i bordbestillings-grenen.
    const giftCard = await getGiftCardByRef(db, verified.paymentRef);
    if (giftCard) {
      if (eventTypeId === EVENT_TRANSACTION_REVERSAL) {
        await markGiftCardRefundedByRef(db, verified.paymentRef);
        return NextResponse.json({ received: true });
      }
      if (verified.status === "paid") {
        const result = await markGiftCardPaidByRef(db, {
          paymentRef: verified.paymentRef,
          amountOre: verified.amountOre,
          currency: verified.currency,
        });
        if (result.status === "amount_mismatch") {
          console.error("Viva-webhook: gavekort-beløb matcher ikke ordren", {
            giftCardNo: result.card.giftCardNo,
          });
          // Kunden har betalt, men får intet: kontoret skal have besked med det samme.
          await advarOmBeloebsfejl({
            type: "Gavekort",
            reference: result.card.giftCardNo,
            kundeNavn: result.card.purchaserName,
            kundeEmail: result.card.purchaserEmail,
            forventetOre: result.card.amountOre,
            betaltOre: verified.amountOre,
            valuta: verified.currency,
            transaktionsId: verified.transactionId,
          });
          return NextResponse.json({ received: true });
        }
        if (result.status !== "paid") {
          // already_paid (idempotent) eller not_found → ingen mail.
          return NextResponse.json({ received: true });
        }
        // Kun vinderen af pending → paid når hertil (præcis én gang). Fejler en
        // sideeffekt, frigives overgangen, så Vivas genforsøg kan prøve igen.
        try {
          await fulfillGiftCard(result.card);
        } catch (err) {
          await revertGiftCardPaidByRef(db, verified.paymentRef);
          console.error("Viva-webhook: kunne ikke fuldføre gavekort");
          return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
        }
        return NextResponse.json({ received: true });
      }
      if (eventTypeId === EVENT_PAYMENT_FAILED) {
        await markGiftCardFailedByRef(db, verified.paymentRef);
        return NextResponse.json({ received: true });
      }
      return NextResponse.json({ received: true });
    }

    // Dirigering på VORES EGEN reference — ikke på tags. Viva returnerer ikke
    // pålideligt de tags, vi satte på ordren, tilbage på den hentede transaktion
    // (demo giver fx en tom liste), så tags kan ikke bruges til at afgøre flowet.
    // Findes orderCode i billet-ledgeren, er det et billet/genbestil-flow (rækken
    // kender selv hvilket via ticket.flow); ellers behandles det som en
    // bordbestilling. Begge veje er fail-closed: en ukendt reference giver
    // "not_found" og ingen tilstandsændring.
    const ticket = await getTicketPayment(db, verified.paymentRef);

    if (!ticket) {
      // Bordbestilling (eller en reference vi ikke kender → ingen ændring).
      if (eventTypeId === EVENT_TRANSACTION_REVERSAL) {
        await markOrderRefundedByRef(db, "viva", verified.paymentRef);
      } else if (verified.status === "paid") {
        const result = await markOrderPaidByRef(db, {
          provider: "viva",
          paymentRef: verified.paymentRef,
          transactionId: verified.transactionId,
          amountTotalOre: verified.amountOre,
          currency: verified.currency,
        });
        if (result.status === "amount_mismatch") {
          console.error("Viva-webhook: beløb matcher ikke ordrekladden", {
            orderId: result.orderId,
          });
          await advarOmBordBeloebsfejl(result.orderId, verified);
        }
      } else if (eventTypeId === EVENT_PAYMENT_FAILED) {
        await markOrderFailedByRef(db, "viva", verified.paymentRef);
      }
      return NextResponse.json({ received: true });
    }

    // Billet/genbestil (ticket.flow er det præcise flow; fulfill håndterer begge).
    if (eventTypeId === EVENT_TRANSACTION_REVERSAL) {
      await markTicketRefundedByRef(db, verified.paymentRef);
      return NextResponse.json({ received: true });
    }

    if (verified.status === "paid") {
      const result = await markTicketPaidByRef(db, {
        paymentRef: verified.paymentRef,
        amountOre: verified.amountOre,
        currency: verified.currency,
      });
      if (result.status === "amount_mismatch") {
        console.error("Viva-webhook: beløb matcher ikke booking-total", {
          bookingNo: result.payment.bookingNo,
        });
        // Ingen ændring i systemet, men kontoret får besked med det samme, så
        // kunden ikke står med en betaling og ingen billet.
        await advarOmBeloebsfejl({
          type: result.payment.flow === "genbestil" ? "Genbestilling" : "Billet",
          reference: result.payment.bookingNo,
          kundeNavn: result.payment.customerName,
          kundeEmail: result.payment.customerEmail,
          forventetOre: result.payment.expectedTotalOre,
          betaltOre: verified.amountOre,
          valuta: verified.currency,
          transaktionsId: verified.transactionId,
        });
        return NextResponse.json({ received: true }); // ingen ændring
      }
      if (result.status !== "paid") {
        // not_found (ukendt ref) eller already_paid (idempotent) → ingen mail.
        console.warn("Viva-webhook: ingen handling — billet ikke markeret", {
          reason: result.status,
          paymentRef: verified.paymentRef,
        });
        return NextResponse.json({ received: true });
      }
      // Kun vinderen af pending → paid når hertil (præcis én gang). Fejler en
      // sideeffekt, frigives overgangen igen, så Vivas genforsøg kan prøve på ny.
      try {
        await fulfillTicketPayment(result.payment);
      } catch (err) {
        await revertTicketPaidByRef(db, verified.paymentRef);
        console.error("Viva-webhook: kunne ikke fuldføre billetbetaling");
        return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }

    if (eventTypeId === EVENT_PAYMENT_FAILED) {
      await markTicketFailedByRef(db, verified.paymentRef);
      // Betalingen blev ikke til noget — giv pladserne tilbage med det samme
      // i stedet for at lade dem stå og blokere, til reservationen udløber.
      await frigivReservation(db, verified.paymentRef);
      return NextResponse.json({ received: true });
    }
    // Hverken betalt, refunderet eller fejlet — fx en status vi ikke reagerer
    // på. Logges, så tavse "gør intet"-tilfælde kan diagnosticeres.
    console.warn("Viva-webhook: ingen handling — uventet status", {
      flow: ticket.flow,
      mappedStatus: verified.status,
      eventTypeId,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Viva-webhook: fejl under håndtering");
    // 500 → Viva prøver igen; håndteringen er idempotent.
    return NextResponse.json({ error: "Intern fejl" }, { status: 500 });
  }
}

/**
 * Advarsel til kontoret, når en bordbestilling er betalt med et andet beløb
 * end ordren. Henter bordnummer, ordrenummer og forventet beløb fra databasen.
 * Kaster aldrig.
 */
async function advarOmBordBeloebsfejl(
  orderId: string,
  verified: { amountOre: number; currency: string; transactionId: string | null }
): Promise<void> {
  try {
    const { rows } = await getDb().query<{
      order_number: string;
      table_number: number;
      total_ore: string | number;
      guest_name: string;
    }>(
      `SELECT order_number, table_number, total_ore, guest_name FROM orders WHERE id = $1`,
      [orderId]
    );
    const o = rows[0];
    await advarOmBeloebsfejl({
      type: "Bordbestilling",
      reference: o ? `Bord ${o.table_number}, ordre ${o.order_number}` : `Ordre ${orderId}`,
      kundeNavn: o?.guest_name ?? null,
      forventetOre: o ? Number(o.total_ore) : 0,
      betaltOre: verified.amountOre,
      valuta: verified.currency,
      transaktionsId: verified.transactionId,
    });
  } catch (err) {
    console.error("Kunne ikke sende advarsel om beløbsfejl på bordbestilling");
  }
}

/**
 * Kort advarsel til kontoret, når pladsbogen ikke kunne opdateres for en
 * betalt billet. Kunden har fået sin billet; det er kun tællingen, der
 * mangler, og den kan rettes i hånden på /admin/kapacitet.
 *
 * Må aldrig kaste — den kaldes fra en catch, hvor billetten skal frem uanset.
 */
async function advarOmPladsbogsfejl(bookingNo: string): Promise<void> {
  try {
    await sendMail({
      to: EMAIL_REPLY_TO,
      subject: `Pladsoptællingen mangler en betalt billet — ${bookingNo}`,
      html: orderEmailHtml({
        heading: "Pladsoptællingen kunne ikke opdateres",
        bookingNo,
        lineItems: [
          {
            description: "Billetten er betalt, og kunden har fået sin billet",
            quantity: 1,
            amountSubtotalOre: 0,
          },
        ],
        discountKr: 0,
        totalLabel: "Handling",
        total: "Se efter tallene",
        footerNote:
          "Pladserne blev ikke talt med i pladsbogen. Bookingen og mailen er i orden. Gå ind på /admin/kapacitet og se, om tallene stemmer for forestillingen — ellers vil der kunne sælges flere billetter, end der er plads til.",
      }),
    });
  } catch (err) {
    console.error("Kunne ikke sende advarsel om manglende pladsoptælling");
  }
}

/**
 * Sender en advarsel til kontoret, når en betaling er kommet ind EFTER at
 * reservationen var udløbet. Kunden har betalt og får sin billet, men det kan
 * have gjort en kategori oversolgt — og det skal huset kunne nå at reagere på.
 *
 * Best-effort: en fejl her må aldrig vælte billetten. Mailen sendes kun, hvis
 * en kategori faktisk er kommet over loftet.
 */
async function advarOmSenBetaling(
  showId: string,
  bookingNo: string
): Promise<void> {
  try {
    const show = await getShowDate(showId);
    if (!show) return;
    const kapaciteter = kapaciteterFor(show.kapacitetsjustering);
    const tagne = await hentTagne(getDb(), showId);
    const over = KAPACITETSKATEGORIER.filter(
      (k) => tagne[k] > kapaciteter[k]
    ).map(
      (k) =>
        `${KATEGORI_NAVN[k]}: ${tagne[k]} solgt mod ${kapaciteter[k]} pladser`
    );
    if (over.length === 0) return;

    await sendMail({
      to: EMAIL_REPLY_TO,
      subject: `Oversolgt forestilling — ${show.title} ${show.date} (booking ${bookingNo})`,
      html: orderEmailHtml({
        heading: "En kategori er blevet oversolgt",
        bookingNo,
        lineItems: over.map((tekst) => ({
          description: tekst,
          quantity: 1,
          amountSubtotalOre: 0,
        })),
        discountKr: 0,
        totalLabel: "Forestilling",
        total: `${show.title} ${show.date} kl. ${show.time}`,
        footerNote:
          "Betalingen kom ind, efter at kundens reservation var udløbet. Kunden har betalt og har fået sin billet. Se efter, om der skal findes en plads, eller om der skal refunderes.",
      }),
    });
  } catch (err) {
    console.error("Kunne ikke sende advarsel om oversalg");
  }
}

/**
 * Opdaterer Airtable og sender bekræftelsesmail for en betalt billet- eller
 * genbestilling. Kaldes KUN af den kalder, der vandt pending → paid-overgangen.
 * Kaster ved fejl, så kalderen kan frigive overgangen igen.
 */
async function fulfillTicketPayment(payment: TicketPaymentRow): Promise<void> {
  const paidKr = Math.round(payment.expectedTotalOre / 100);
  const discountKr = Math.round(payment.discountOre / 100);

  // Billetkøb: gør de holdte pladser til et endeligt salg, FØR Airtable og
  // mailen. Er reservationen nået at udløbe, får kunden alligevel sin billet —
  // de har betalt — og pladserne tages igen. Kan det ikke lade sig gøre, fordi
  // kategorien derved bliver oversolgt, sendes en advarsel til kontoret.
  // Genbestilling af drikkevarer har ingen pladser og røres ikke.
  //
  // Fejler pladsbogen, må det ALDRIG stoppe billetten: kunden har betalt, og
  // bookingen skal opdateres og mailen sendes. Fejlen logges, og kontoret får
  // en kort advarsel, så tallene kan rettes bagefter.
  if (payment.flow === "billet") {
    try {
      const salg = await markerSolgt(getDb(), payment.paymentRef);
      if (salg.udloebet && salg.showId) {
        await advarOmSenBetaling(salg.showId, payment.bookingNo);
      }
    } catch (err) {
      console.error("Pladsbogen kunne ikke opdateres for en betalt billet", {
        bookingNo: payment.bookingNo,
      });
      await advarOmPladsbogsfejl(payment.bookingNo);
    }
  }

  if (payment.flow === "genbestil") {
    // Lægger drinks oven i bookingen og sender bekræftelsen. Fejler mailen,
    // efter at Airtable er opdateret, kastes der IKKE (så tælles drinksene ikke
    // dobbelt ved Vivas genforsøg); kontoret får i stedet besked.
    await fulfillGenbestilling(payment);
    return;
  }

  // flow === "billet": markér betalt og send billetten.
  await updateRecord(TABLES.bookings, payment.bookingId, {
    [FIELDS.booking.status]: "Betalt",
    [FIELDS.booking.totalPaid]: paidKr,
  });
  if (payment.customerEmail) {
    // Forestillingens detaljer hentes fra bookingen. Fejler opslaget, sendes
    // billetten stadig — blot uden de detaljer, vi ikke kunne hente.
    let showTitle = "";
    let showDateIso = "";
    let showTime = "";
    let seats = "";
    try {
      const bk = await getRecord(TABLES.bookings, payment.bookingId);
      const view = await buildBookingView(bk);
      showTitle = view.showTitle;
      showDateIso = view.showDate;
      showTime = view.showTime;
      seats = view.ticketBreakdown;
    } catch (e) {
      console.error("Kunne ikke hente forestillingsdata til billet");
    }
    const subtotalKr = paidKr + discountKr;
    await sendMail({
      to: payment.customerEmail,
      subject: showDateIso
        ? `Din billet til Bakkens Hvile ${daDateShort(showDateIso)} — ${payment.bookingNo}`
        : `Din billet til Bakkens Hvile — ${payment.bookingNo}`,
      html: ticketEmailHtml({
        customerName: payment.customerName ?? "",
        bookingNo: payment.bookingNo,
        showTitle,
        showDateIso,
        showTime,
        seats,
        isJubilee: showYear(showDateIso) === 2027,
        lineItems: payment.lineItems,
        subtotalKr,
        discountKr,
        totalKr: paidKr,
        discountLabel: ADDON_DISCOUNT_LABEL,
      }),
    });
  }
}

/**
 * Sender gavekortet til modtageren (med koden) og en kvittering til køberen.
 * Modtager-mailen er kritisk (kaster ved fejl → webhooken ruller tilbage og
 * Viva prøver igen); køber-kvitteringen er best-effort og vælter ikke flowet.
 */
async function fulfillGiftCard(card: GiftCardRow): Promise<void> {
  const amountKr = Math.round(card.amountOre / 100);
  const expiresIso = card.expiresAt ?? new Date().toISOString();

  await sendMail({
    to: card.recipientEmail,
    subject: "Du har fået et gavekort til Bakkens Hvile",
    html: giftCardRecipientEmailHtml({
      code: card.code ?? "",
      amountKr,
      expiresIso,
      purchaserName: card.purchaserName,
      message: card.message,
    }),
  });

  if (card.purchaserEmail) {
    try {
      await sendMail({
        to: card.purchaserEmail,
        subject: `Kvittering for dit gavekort — ${card.giftCardNo}`,
        html: giftCardPurchaserEmailHtml({
          giftCardNo: card.giftCardNo,
          amountKr,
          recipientEmail: card.recipientEmail,
          expiresIso,
        }),
      });
    } catch (err) {
      console.error("Gavekort: kunne ikke sende kvittering til køber (fortsætter)");
    }
  }
}
