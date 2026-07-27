import { NextRequest, NextResponse } from "next/server";
import { authenticateBooking, buildBookingView } from "@/lib/genbestil";

// Generisk fejl — afslører aldrig om det var nummer, nøgle eller email der fejlede.
const GENERIC_ERROR =
  "Vi kunne ikke finde en booking, der matcher. Tjek oplysningerne og prøv igen.";

export async function POST(req: NextRequest) {
  try {
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
