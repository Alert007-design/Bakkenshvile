// Salgsstatus for alle kommende forestillinger (kun visning).
// Tallene kommer fra pladsbogen i databasen; Airtable bruges til
// forestillingerne og til at finde gamle bookinger, der mangler betaling.
// Bag personalelogin (middleware.ts + verifyStaffSession).

import { NextRequest, NextResponse } from "next/server";
import { findAllRecords, TABLES, FIELDS } from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import { getDb } from "@/lib/db";
import { frigivUdloebneForShows, hentTagneForShows } from "@/lib/seat-holds";
import { KAPACITETSKATEGORIER, KATEGORI_NAVN, kapaciteterFor } from "@/lib/kapacitet";
import { manglerBetaling } from "@/lib/gaesteliste";
import { fordelSalg, byggStatuslinje, type HoldLinje } from "@/lib/salgsstatus";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Booking-id'er fra det gamle system, der stadig mangler betaling. */
async function hentUbetalte(): Promise<Set<string>> {
  const poster = await findAllRecords(
    TABLES.bookings,
    `FIND("Ikke betalt i det gamle system", {Særlige ønsker})`
  );
  const ud = new Set<string>();
  for (const p of poster) {
    const betalt = p.fields[FIELDS.booking.totalPaid];
    const rest = manglerBetaling(
      String(p.fields[FIELDS.booking.specialRequests] ?? ""),
      typeof betalt === "number" ? betalt : null
    );
    if (rest !== null) ud.add(p.id);
  }
  return ud;
}

export async function GET(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) return NextResponse.json({ error: "Log ind igen." }, { status: 401 });

  try {
    const db = getDb();
    const shows = await listShowDates();
    const showIds = shows.map((x) => x.id);

    await frigivUdloebneForShows(db, showIds);
    const [tagne, { rows }] = await Promise.all([
      hentTagneForShows(db, showIds),
      db.query<{ show_id: string; booking_id: string; category: string; quantity: number | string; status: string }>(
        `SELECT show_id, booking_id, category, quantity, status
           FROM seat_holds
          WHERE show_id = ANY($1) AND status IN ('held','sold')`,
        [showIds]
      ),
    ]);

    // Fejler opslaget i Airtable, vises siden stadig; de gamle ubetalte
    // bookinger tælles så som solgt, og siden siger det tydeligt.
    let ubetalte = new Set<string>();
    let ubetalteFejl = false;
    try {
      ubetalte = await hentUbetalte();
    } catch {
      ubetalteFejl = true;
      console.error("Salgsstatus: kunne ikke hente ubetalte bookinger fra Airtable");
    }

    const holds: HoldLinje[] = rows.map((r) => ({
      showId: r.show_id,
      bookingId: r.booking_id,
      kategori: r.category as HoldLinje["kategori"],
      antal: Number(r.quantity),
      status: r.status as HoldLinje["status"],
    }));
    const fordelt = fordelSalg(holds, ubetalte);
    const nul = { aplusForrest: 0, aplusBagerst: 0, a: 0, b: 0 };

    const forestillinger = shows.map((show) => {
      const f = fordelt.get(show.id);
      const linje = byggStatuslinje({
        kapaciteter: kapaciteterFor(show.kapacitetsjustering),
        tagne: tagne.get(show.id) ?? nul,
        solgt: f?.solgt ?? nul,
        reserveret: f?.reserveret ?? nul,
        manueltUdsolgt: show.soldOut,
      });
      return {
        id: show.id,
        titel: show.title,
        dato: show.date,
        tid: show.time,
        manueltUdsolgt: show.soldOut,
        ...linje,
      };
    });

    return NextResponse.json(
      {
        kategorier: KAPACITETSKATEGORIER.map((k) => ({ noegle: k, navn: KATEGORI_NAVN[k] })),
        forestillinger,
        ubetalteFejl,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.error("Salgsstatus: kunne ikke hente tallene");
    return NextResponse.json({ error: "Salgsstatus kunne ikke hentes. Prøv igen om lidt." }, { status: 500 });
  }
}
