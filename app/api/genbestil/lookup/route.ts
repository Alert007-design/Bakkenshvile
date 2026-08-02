import { NextRequest, NextResponse } from "next/server";
import { authenticateBooking, buildBookingView } from "@/lib/genbestil";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Generisk fejl — afslører aldrig om det var nummer, nøgle eller e-mail der fejlede,
// så et bookingnummer eller en e-mail ikke kan gættes ved at prøve sig frem.
const GENERIC_ERROR =
  "Vi kunne ikke finde en booking, der matcher. Tjek oplysningerne og prøv igen.";

export async function POST(req: NextRequest) {
  try {
    // Ratebegrænsning pr. IP (brute-force-værn mod gætteforsøg).
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "ukendt";
    const rl = rateLimit(`genbestil-lookup:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "For mange forsøg. Vent et øjeblik og prøv igen." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { ref, key, bookingNo, email } = body ?? {};
    const booking = await authenticateBooking({ ref, key, bookingNo, email });
    if (!booking) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }
    const view = await buildBookingView(booking);
    return NextResponse.json({ booking: view });
  } catch (err) {
    console.error("Genbestil-lookup fejlede", err);
    return NextResponse.json(
      { error: "Noget gik galt. Prøv igen." },
      { status: 500 }
    );
  }
}
