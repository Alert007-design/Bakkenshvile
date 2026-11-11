// Flyt en betalt reservation til en anden dato (fra /admin/opslag).
// Bag personalelogin; POST kræver også csrf-tegn.
//
// GET  ?bookingId=rec…  → kommende forestillinger med ledige pladser og
//                          prisforskel for netop denne booking.
// POST { bookingId, showId } → flytter. Reglerne ligger i lib/flyt-booking.ts.

import { NextRequest, NextResponse } from "next/server";
import {
  cachedListRecords,
  getRecord,
  updateRecord,
  TABLES,
  FIELDS,
  priceGroupName,
} from "@/lib/airtable";
import { getShowDate, listShowDates } from "@/lib/events";
import type { TicketTypeDef } from "@/lib/ticket-checkout";
import { sendMail } from "@/lib/resend";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { getDb } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import {
  KAPACITETSKATEGORIER,
  kapaciteterFor,
  kategoriFraAirtable,
  type Kapacitetskategori,
} from "@/lib/kapacitet";
import { frigivUdloebneForShows, hentPladslinjer, hentTagneForShows } from "@/lib/seat-holds";
import { beregnPrisforskel, flytBooking } from "@/lib/flyt-booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

async function hentBilletTyper(): Promise<TicketTypeDef[]> {
  const records = await cachedListRecords(TABLES.ticketTypes, 60_000);
  return records.map(
    (r): TicketTypeDef => ({
      id: r.id,
      category: String(r.fields[FIELDS.ticketType.category] ?? ""),
      price: Number(r.fields[FIELDS.ticketType.price] ?? 0),
      fee: Number(r.fields[FIELDS.ticketType.fee] ?? 0),
      maxCount: Number(r.fields[FIELDS.ticketType.maxCount] ?? 0),
      priceGroup: priceGroupName(r.fields[FIELDS.ticketType.priceGroup]),
      kapacitetskategori: kategoriFraAirtable(r.fields[FIELDS.ticketType.kapacitetskategori]),
    })
  );
}

async function hent(tabel: string, id: string) {
  try {
    return await getRecord(tabel, id);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  const bookingId = req.nextUrl.searchParams.get("bookingId") ?? "";
  if (!RECORD_ID.test(bookingId)) {
    return NextResponse.json({ error: "Bookingen mangler eller er ugyldig." }, { status: 400 });
  }
  try {
    const booking = await hent(TABLES.bookings, bookingId);
    if (!booking) return NextResponse.json({ error: "Bookingen findes ikke." }, { status: 404 });
    const fraId = (booking.fields[FIELDS.booking.show] as string[] | undefined)?.[0] ?? "";
    const db = getDb();
    const [fra, shows, typer, alleLinjer] = await Promise.all([
      fraId ? getShowDate(fraId) : Promise.resolve(null),
      listShowDates(),
      hentBilletTyper(),
      hentPladslinjer(db, bookingId),
    ]);
    const linjer = alleLinjer.filter((l) => l.showId === fraId);
    const andre = shows.filter((s) => s.id !== fraId);
    await frigivUdloebneForShows(db, andre.map((s) => s.id));
    const tagne = await hentTagneForShows(db, andre.map((s) => s.id));
    const oensket: Partial<Record<Kapacitetskategori, number>> = {};
    for (const l of linjer) oensket[l.kategori] = (oensket[l.kategori] ?? 0) + l.antal;

    const muligheder = andre.map((s) => {
      const loft = kapaciteterFor(s.kapacitetsjustering ?? {});
      const taget = tagne.get(s.id);
      const ledige = Object.fromEntries(
        KAPACITETSKATEGORIER.map((k) => [k, Math.max(0, loft[k] - (taget?.[k] ?? 0))])
      ) as Record<Kapacitetskategori, number>;
      const plads = KAPACITETSKATEGORIER.every((k) => (oensket[k] ?? 0) <= ledige[k]);
      const pris = fra && linjer.length > 0 ? beregnPrisforskel(linjer, fra, s, typer) : null;
      return {
        id: s.id,
        title: s.title,
        date: s.date,
        time: s.time,
        ledige,
        plads,
        prisforskelKr: pris?.ok ? pris.forskelKr : null,
        grund: !pris
          ? "Bookingen har ingen pladser i pladsoptællingen."
          : !pris.ok
            ? pris.error
            : !plads
              ? "Ikke plads nok."
              : "",
      };
    });
    return NextResponse.json({ oensket, muligheder });
  } catch {
    console.error("Flyt: listen over datoer kunne ikke hentes");
    return NextResponse.json({ error: "Datoerne kunne ikke hentes. Prøv igen om lidt." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  let bookingId = "";
  let showId = "";
  try {
    const body = await req.json();
    bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    showId = typeof body?.showId === "string" ? body.showId : "";
  } catch {
    bookingId = "";
  }
  if (!RECORD_ID.test(bookingId) || !RECORD_ID.test(showId)) {
    return NextResponse.json({ error: "Booking eller forestilling mangler." }, { status: 400 });
  }

  try {
    const svar = await flytBooking(
      {
        db: getDb(),
        hentBooking: (id) => hent(TABLES.bookings, id),
        hentKunde: (id) => hent(TABLES.customers, id),
        hentShow: getShowDate,
        hentBilletTyper,
        opdaterBooking: async (id, felter) => {
          await updateRecord(TABLES.bookings, id, felter);
        },
        // Hentes først her, så flytning uden prisforskel virker, selv om
        // betaling er slået fra. Fejler det, flyttes der stadig, og
        // personalet får besked.
        opretBetaling: (input) => getPaymentProvider("tickets").createPayment(input),
        sendMail: async (m) => {
          await sendMail(m);
        },
        sourceCode: vivaSourceCode("tickets"),
        origin: req.nextUrl.origin,
        nu: () => new Date(),
        log: (besked, ctx) => console.error(besked, ctx),
      },
      bookingId,
      showId
    );
    if (!svar.ok) {
      return NextResponse.json({ error: svar.error }, { status: svar.status });
    }
    return NextResponse.json(svar);
  } catch {
    console.error("Flytning fejlede uventet");
    return NextResponse.json(
      { error: "Bookingen kunne ikke flyttes lige nu. Tjek bookingen, før du prøver igen." },
      { status: 500 }
    );
  }
}
