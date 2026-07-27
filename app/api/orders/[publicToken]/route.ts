import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getOrderForGuest } from "@/lib/orders";
import { MIN_TOKEN_LENGTH } from "@/lib/table-tokens";

export const runtime = "nodejs";

// Gæstens adgang til EGEN ordre via det hemmelige public_token. Returnerer kun
// ufølsomme felter for netop den ordre — aldrig andre gæsters data.
export async function GET(
  req: NextRequest,
  { params }: { params: { publicToken: string } }
) {
  const token = params.publicToken;
  if (!token || token.length < MIN_TOKEN_LENGTH) {
    return NextResponse.json({ error: "Ukendt ordre." }, { status: 404 });
  }
  const order = await getOrderForGuest(getDb(), token);
  if (!order) {
    return NextResponse.json({ error: "Ukendt ordre." }, { status: 404 });
  }
  return NextResponse.json(order, {
    // Kort cache er ok — gæsten poller hvert 8.-10. sek.
    headers: { "Cache-Control": "private, max-age=5" },
  });
}
