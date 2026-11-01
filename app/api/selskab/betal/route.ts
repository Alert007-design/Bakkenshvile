// Kundens betaling af en selskabsreservation. Linket i mailen indeholder
// bookingnummer og en hemmelig nøgle; begge tjekkes på serveren, og alle
// beløb beregnes her ud fra Airtable-priserne (lib/selskab.ts).

import { NextRequest, NextResponse } from "next/server";
import { startBetaling } from "@/lib/selskab";
import { faelles } from "@/lib/selskab-server";
import { getPaymentProvider } from "@/lib/payments";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukendt";
  if (!rateLimit(`selskab-betal:${ip}`, 10, 60_000).ok) {
    return NextResponse.json({ error: "For mange forsøg. Vent et øjeblik og prøv igen." }, { status: 429 });
  }
  try {
    const body = (await req.json()) ?? {};
    // Fejler lukket, hvis livebetaling af billetter ikke er slået til.
    const provider = getPaymentProvider("tickets");
    const svar = await startBetaling(
      {
        db: faelles.db,
        hentShow: faelles.hentShow,
        hentBilletTyper: faelles.hentBilletTyper,
        findBooking: faelles.findBooking,
        hentTilvalg: faelles.hentTilvalg,
        rabatAktiv: faelles.rabatAktiv,
        idag: faelles.idag(),
        opretBetaling: (input) => provider.createPayment(input),
        sourceCode: vivaSourceCode("tickets"),
        origin: req.nextUrl.origin,
      },
      {
        bookingNo: body.bookingNo,
        noegle: body.noegle,
        addons: body.addons,
      }
    );
    if (!svar.ok) return NextResponse.json({ error: svar.error }, { status: svar.status });
    return NextResponse.json({ url: svar.url });
  } catch {
    console.error("Selskab: betalingen kunne ikke startes");
    return NextResponse.json({ error: "Betalingen kunne ikke startes. Prøv igen om lidt." }, { status: 500 });
  }
}
