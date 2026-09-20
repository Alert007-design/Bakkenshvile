// Adminoversigt og import af gamle bookinger.
//
// GET  — kapacitet, solgt, reserveret og tilbage pr. kommende forestilling,
//        plus listen over billettyper uden kapacitetskategori og listen over
//        gamle bookinger, der ikke kan placeres entydigt.
// POST — bogfører de bookinger, der KAN placeres entydigt ("importer"), eller
//        placerer én enkelt booking, ejeren selv har taget stilling til
//        ("placer").
//
// Alt her er bag personalelogin (middleware.ts + verifyStaffSession).

import { NextRequest, NextResponse } from "next/server";
import {
  cachedListRecords,
  getRecord,
  TABLES,
  FIELDS,
} from "@/lib/airtable";
import { listShowDates } from "@/lib/events";
import { getDb } from "@/lib/db";
import {
  frigivUdloebneForShows,
  genberegnTagneForShows,
  hentTagneForShows,
  registrerSalg,
} from "@/lib/seat-holds";
import {
  KAPACITETSKATEGORIER,
  KATEGORI_NAVN,
  byggOversigt,
  kapaciteterFor,
  kategoriFraAirtable,
  type Kapacitetskategori,
} from "@/lib/kapacitet";
import {
  FEJLTEKST,
  opslagsBillettype,
  placerBookinger,
  type BookingTilImport,
  type OpslagsBillettype,
} from "@/lib/kapacitet-import";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusNavn(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return String((value as { name?: unknown }).name ?? "");
  }
  return "";
}

/** Billettyperne med deres kapacitetskategori. */
async function hentBillettyper(): Promise<
  (OpslagsBillettype & { prisgruppe: string })[]
> {
  const poster = await cachedListRecords(TABLES.ticketTypes, 60_000);
  return poster.map((r) => ({
    ...opslagsBillettype(
      r.id,
      r.fields[FIELDS.ticketType.category],
      r.fields[FIELDS.ticketType.kapacitetskategori]
    ),
    prisgruppe: String(r.fields[FIELDS.ticketType.priceGroup] ?? ""),
  }));
}

/**
 * Betalte bookinger på kommende forestillinger, som endnu ikke står i
 * pladsbogen. Både almindelige køb og fribilletter har status "Betalt".
 *
 * Det er sitets dyreste opslag: Airtable kan ikke slå mange bookinger op på én
 * gang, så der skal ét kald til pr. booking, der ikke allerede er talt med.
 * Airtable tillader kun 5 kald i sekundet, så det tager tid. Derfor:
 *  - kald KUN denne, når listen faktisk skal bruges (ikke ved hvert sidevisning)
 *  - bookinger, der allerede står i pladsbogen, springes over uden opslag
 *  - gæstens navn hentes IKKE her; det slås først op for de få bookinger, der
 *    ikke kan placeres automatisk, og som ejeren derfor skal se
 */
async function hentBookingerDerMangler(
  showIds: string[]
): Promise<BookingTilImport[]> {
  const db = getDb();
  const { rows } = await db.query<{ booking_id: string }>(
    `SELECT DISTINCT booking_id FROM seat_holds WHERE show_id = ANY($1)`,
    [showIds]
  );
  const kendte = new Set(rows.map((r) => r.booking_id));

  const events = await cachedListRecords(TABLES.events, 60_000);
  const relevante = new Set(showIds);
  const ud: BookingTilImport[] = [];
  for (const event of events) {
    if (!relevante.has(event.id)) continue;
    const dato = String(event.fields[FIELDS.event.date] ?? "");
    const bookingIds =
      (event.fields[FIELDS.event.bookings] as string[] | undefined) ?? [];
    for (const bookingId of bookingIds) {
      if (kendte.has(bookingId)) continue;
      try {
        const b = await getRecord(TABLES.bookings, bookingId);
        if (statusNavn(b.fields[FIELDS.booking.status]) !== "Betalt") continue;
        ud.push({
          bookingId,
          bookingNo: String(b.fields[FIELDS.booking.bookingNo] ?? ""),
          showId: event.id,
          ticketBreakdown: String(b.fields[FIELDS.booking.ticketBreakdown] ?? ""),
          kundenavn: "",
          dato,
        });
      } catch {
        // En booking, der ikke kan læses, springes ikke stille over: den
        // tages med som uplacerbar længere nede.
        ud.push({
          bookingId,
          bookingNo: "",
          showId: event.id,
          ticketBreakdown: "",
          kundenavn: "",
          dato,
        });
      }
    }
  }
  return ud;
}

/**
 * Slår gæstenavne op for de få bookinger, ejeren skal tage stilling til.
 * Holdes adskilt fra opslaget ovenfor, så vi ikke henter et navn for hver
 * eneste booking — kun for dem, der rent faktisk vises.
 */
async function tilfoejKundenavne(
  uplacerede: { booking: BookingTilImport }[]
): Promise<Map<string, string>> {
  const navne = new Map<string, string>();
  for (const u of uplacerede) {
    try {
      const b = await getRecord(TABLES.bookings, u.booking.bookingId);
      const kundeId = (b.fields[FIELDS.booking.customer] as
        | string[]
        | undefined)?.[0];
      if (!kundeId) continue;
      const k = await getRecord(TABLES.customers, kundeId);
      navne.set(u.booking.bookingId, String(k.fields[FIELDS.customer.name] ?? ""));
    } catch {
      // Uden navn vises bookingnummeret alene — bedre end at fejle.
    }
  }
  return navne;
}

export async function GET(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) return NextResponse.json({ error: "Log ind igen." }, { status: 401 });

  // To slags svar, så siden kan vises hurtigt:
  //   uden ?gamle=1 → selve overblikket. Tallene kommer fra vores egen
  //     database i tre samlede kald, og Airtable læses kun gennem den cache,
  //     siden alligevel bruger. Det er hurtigt, uanset hvor mange bookinger
  //     der findes.
  //   med ?gamle=1 → gennemgangen af gamle bookinger, som kræver ét
  //     Airtable-opslag pr. booking og derfor tager tid. Hentes separat, efter
  //     at overblikket er vist.
  const kunGamle = req.nextUrl.searchParams.get("gamle") === "1";

  try {
    const db = getDb();
    const [shows, billettyper] = await Promise.all([
      listShowDates(),
      hentBillettyper(),
    ]);
    const showIds = shows.map((s2) => s2.id);

    if (kunGamle) {
      const { placerede, uplacerede } = placerBookinger(
        await hentBookingerDerMangler(showIds),
        billettyper
      );
      const navne = await tilfoejKundenavne(uplacerede);
      return NextResponse.json(
        {
          // Hvor mange gamle bookinger der venter på at blive talt med.
          klarTilImport: placerede.length,
          uplacerede: uplacerede.map((u) => ({
            bookingId: u.booking.bookingId,
            bookingNo: u.booking.bookingNo,
            showId: u.booking.showId,
            dato: u.booking.dato,
            kundenavn: navne.get(u.booking.bookingId) ?? "",
            tekst: u.booking.ticketBreakdown,
            detalje: u.detalje,
            aarsag: FEJLTEKST[u.fejl],
          })),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Tre samlede databasekald i stedet for tre pr. forestilling.
    await frigivUdloebneForShows(db, showIds);
    const [tagne, genberegnede] = await Promise.all([
      hentTagneForShows(db, showIds),
      // Tæl pladsbogens linjer sammen forfra, så en eventuel uenighed mellem
      // de fire tal og linjerne er synlig i stedet for skjult.
      genberegnTagneForShows(db, showIds),
    ]);

    const nul = { aplusForrest: 0, aplusBagerst: 0, a: 0, b: 0 };
    const forestillinger = shows.map((show) => {
      const oversigt = byggOversigt({
        kapaciteter: kapaciteterFor(show.kapacitetsjustering),
        tagne: tagne.get(show.id) ?? nul,
        manueltUdsolgt: show.soldOut,
      });
      const genberegnet = genberegnede.get(show.id) ?? nul;
      return {
        id: show.id,
        titel: show.title,
        dato: show.date,
        tid: show.time,
        manueltUdsolgt: show.soldOut,
        kategorier: KAPACITETSKATEGORIER.map((k) => ({
          noegle: k,
          navn: KATEGORI_NAVN[k],
          kapacitet: oversigt[k].kapacitet,
          taget: oversigt[k].taget,
          tilbage: oversigt[k].tilbage,
          genberegnet: genberegnet[k],
        })),
      };
    });

    const manglerKategori = billettyper
      .filter((t) => t.kapacitetskategori === null)
      .map((t) => ({ id: t.id, navn: t.category, prisgruppe: t.prisgruppe }));

    return NextResponse.json(
      { forestillinger, manglerKategori },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("Kapacitetsoversigt fejlede");
    return NextResponse.json(
      { error: "Kunne ikke hente oversigten." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const db = getDb();
    const billettyper = await hentBillettyper();
    const shows = await listShowDates();

    // "placer": ejeren har selv taget stilling til én booking fra listen.
    if (body?.handling === "placer") {
      const bookingId = String(body.bookingId ?? "");
      const showId = String(body.showId ?? "");
      const kategori = String(body.kategori ?? "") as Kapacitetskategori;
      const antal = Number(body.antal);
      if (
        !bookingId ||
        !showId ||
        !KAPACITETSKATEGORIER.includes(kategori) ||
        !Number.isInteger(antal) ||
        antal <= 0
      ) {
        return NextResponse.json({ error: "Ugyldig placering." }, { status: 400 });
      }
      const r = await registrerSalg(db, {
        showId,
        bookingId,
        oensker: [{ kategori, antal }],
        kilde: "import",
      });
      return NextResponse.json({ ok: true, registreret: r.registreret });
    }

    // "importer": bogfør alle de bookinger, der kan placeres entydigt.
    const { placerede, uplacerede } = placerBookinger(
      await hentBookingerDerMangler(shows.map((x) => x.id)),
      billettyper
    );

    let importeret = 0;
    for (const p of placerede) {
      const r = await registrerSalg(db, {
        showId: p.booking.showId,
        bookingId: p.booking.bookingId,
        oensker: p.oensker,
        kilde: "import",
      });
      if (r.registreret > 0) importeret++;
    }

    return NextResponse.json({
      ok: true,
      importeret,
      kunneIkkePlaceres: uplacerede.length,
    });
  } catch (err) {
    console.error("Import af gamle bookinger fejlede");
    return NextResponse.json(
      { error: "Importen kunne ikke gennemføres." },
      { status: 500 }
    );
  }
}
