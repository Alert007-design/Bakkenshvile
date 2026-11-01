// Store selskaber med betalingsfrist (admin). Bag personalelogin.
//
// GET  — alle selskabsreservationer med frist og tilstand.
// POST — { handling: "opret", ... }    opretter en reservation (lib/selskab.ts)
//        { handling: "faktura", bookingId } markerer den betalt på faktura

import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession, verifyCsrf, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { listSelskaber, markerBetaltFaktura, opretSelskab, type OpretInput } from "@/lib/selskab";
import { faelles } from "@/lib/selskab-server";
import { sendMail } from "@/lib/resend";
import { ticketEmailHtml, daDateShort, showYear } from "@/lib/ticket-email";
import { orderEmailHtml } from "@/lib/order-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import { SALGSMAIL_TIL } from "@/lib/salgsmail";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  }
  try {
    const raekker = await listSelskaber(faelles.db);
    const idag = faelles.idag();
    return NextResponse.json(
      {
        idag,
        selskaber: raekker.map((r) => ({
          bookingId: r.bookingId,
          bookingNo: r.bookingNo,
          showId: r.showId,
          kunde: r.customerName,
          email: r.customerEmail,
          antal: r.tickets.reduce((s, t) => s + t.quantity, 0),
          frist: r.deadline,
          paamindelseSendt: r.reminderSentAt !== null,
          tilstand: r.paidAt
            ? "betalt"
            : r.cancelledAt
            ? "annulleret"
            : r.deadline < idag
            ? "frist overskredet"
            : "afventer betaling",
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.error("Selskaber: listen kunne ikke hentes");
    return NextResponse.json({ error: "Listen kunne ikke hentes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = verifyStaffSession(req.cookies.get(STAFF_COOKIE_NAME)?.value);
  if (!s) return NextResponse.json({ error: "Log ind igen." }, { status: 401 });
  if (!verifyCsrf(s, req.headers.get("x-csrf-token"))) {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }

  try {
    if (body.handling === "faktura") {
      const bookingId = String(body.bookingId ?? "");
      if (!/^rec[A-Za-z0-9]{14}$/.test(bookingId)) {
        return NextResponse.json({ error: "Ugyldig booking." }, { status: 400 });
      }
      const svar = await markerBetaltFaktura(
        {
          db: faelles.db,
          hentShow: faelles.hentShow,
          hentBilletTyper: faelles.hentBilletTyper,
          opdaterBooking: faelles.opdaterBooking,
          sendBillet: async (p) => {
            const kr = Math.round(p.totalOre / 100);
            await sendMail({
              to: p.email,
              subject: `Din billet til Bakkens Hvile ${daDateShort(p.show.date)} — ${p.bookingNo}`,
              html: ticketEmailHtml({
                customerName: p.navn,
                bookingNo: p.bookingNo,
                showTitle: p.show.title,
                showDateIso: p.show.date,
                showTime: p.show.time,
                seats: p.pladser,
                isJubilee: showYear(p.show.date) === 2027,
                lineItems: p.linjer,
                subtotalKr: kr,
                discountKr: 0,
                totalKr: kr,
                discountLabel: ADDON_DISCOUNT_LABEL,
              }),
            });
          },
          meldTilKontoret: async (p) => {
            await sendMail({
              to: SALGSMAIL_TIL,
              subject: `Betalt på faktura — ${p.bookingNo} (${p.navn})`,
              html: orderEmailHtml({
                heading: "Reservation betalt på faktura",
                bookingNo: p.bookingNo,
                lineItems: [
                  {
                    description: `${p.show.title} ${p.show.date} kl. ${p.show.time}: ${p.pladser}`,
                    quantity: 1,
                    amountSubtotalOre: p.totalOre,
                  },
                ],
                discountKr: 0,
                totalLabel: "Faktureret",
                total: `${Math.round(p.totalOre / 100).toLocaleString("da-DK")} kr.`,
                footerNote: `Markeret som betalt på faktura i admin. Kunden (${p.email}) har fået sin billet. Beløbet er ikke gået gennem Viva.`,
              }),
            });
          },
        },
        bookingId
      );
      if (!svar.ok) return NextResponse.json({ error: svar.error }, { status: svar.status });
      return NextResponse.json({ ok: true });
    }

    if (body.handling === "opret") {
      const svar = await opretSelskab(
        {
          db: faelles.db,
          hentShow: faelles.hentShow,
          hentBilletTyper: faelles.hentBilletTyper,
          opretKunde: faelles.opretKunde,
          opretBooking: faelles.opretBooking,
          sendMail: faelles.sendMail,
          origin: siteUrl(),
          idag: faelles.idag(),
        },
        body as OpretInput
      );
      if (!svar.ok) {
        const { ok: _ok, status, ...rest } = svar;
        return NextResponse.json(rest, { status });
      }
      return NextResponse.json(svar);
    }

    return NextResponse.json({ error: "Ukendt handling." }, { status: 400 });
  } catch {
    console.error("Selskaber: handlingen fejlede");
    return NextResponse.json({ error: "Det lykkedes ikke. Prøv igen." }, { status: 500 });
  }
}
