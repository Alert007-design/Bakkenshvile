import { NextRequest, NextResponse } from "next/server";
import { listRecords, getRecord, TABLES, FIELDS } from "@/lib/airtable";
import { getDb } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import { createTicketPayment, type TicketLineItem } from "@/lib/ticket-payments";
import { addonsTotalDiscountKr } from "@/lib/pricing";
import { authenticateBooking, buildBookingView } from "@/lib/genbestil";

// Betalingen udløber efter 30 min. (samme vindue som billetkøbet).
const CHECKOUT_EXPIRY_MINUTES = 30;

const GENERIC_ERROR =
  "Vi kunne ikke finde en booking, der matcher. Tjek oplysningerne og prøv igen.";

const CLOSED_MESSAGE =
  "Genbestilling er lukket for denne dato. Drikkevarer kan bestilles ved bordet hos tjenerne.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ref, key, bookingNo, email, addonQty } = body ?? {};

    // 1) Genkend gæsten på ny — vi stoler aldrig på klienten.
    const booking = await authenticateBooking({ ref, key, bookingNo, email });
    if (!booking) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    // 2) Deadline: kl. 12.00 dansk tid på showdagen (serverside-tjek).
    const view = await buildBookingView(booking);
    if (view.deadlinePassed) {
      return NextResponse.json({ error: CLOSED_MESSAGE }, { status: 403 });
    }

    // 3) Byg tilvalgslinjer ud fra Airtable-priser (aldrig klientens tal).
    const qty: Record<string, number> = addonQty ?? {};
    const addOns = await listRecords(TABLES.addOns);
    const lineItems = addOns
      .map((r) => ({
        name: String(r.fields[FIELDS.addOn.name] ?? ""),
        price: Number(r.fields[FIELDS.addOn.price] ?? 0),
        quantity: Math.max(0, Math.floor(Number(qty[r.id] ?? 0))),
      }))
      .filter((li) => li.quantity > 0 && li.price > 0 && li.name);

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "Vælg mindst én drikkevare." },
        { status: 400 }
      );
    }

    const discount = addonsTotalDiscountKr(
      lineItems.map((li) => ({ unitKr: li.price, quantity: li.quantity }))
    );

    // 4) Kundens email til kvitteringen.
    const custId = (booking.fields[FIELDS.booking.customer] as
      | string[]
      | undefined)?.[0];
    let customerEmail: string | undefined;
    if (custId) {
      const cust = await getRecord(TABLES.customers, custId);
      customerEmail = String(cust.fields[FIELDS.customer.email] ?? "") || undefined;
    }

    // 5) Betaling hos den valgte udbyder (Viva) på tickets-sourcen. Markeres som
    //    genbestilling via tags[0]="genbestil", så webhooken lægger oven i
    //    bookingen frem for at oprette en ny. Beløb i øre, serverberegnet.
    const origin = req.nextUrl.origin;

    const ledgerLines: TicketLineItem[] = lineItems.map((li) => ({
      description: li.name,
      quantity: li.quantity,
      amountSubtotalOre: Math.round(li.price * 100) * li.quantity,
    }));
    const discountOre = Math.round(discount * 100);
    const expectedTotalOre =
      ledgerLines.reduce((sum, l) => sum + l.amountSubtotalOre, 0) - discountOre;

    const provider = getPaymentProvider("tickets");
    const payment = await provider.createPayment({
      orderId: booking.id,
      orderNumber: view.bookingNo,
      eventId:
        (booking.fields[FIELDS.booking.show] as string[] | undefined)?.[0] ?? "",
      totalOre: expectedTotalOre,
      currency: "dkk",
      description: `Bakkens Hvile · ekstra bestilling · ${view.bookingNo}`,
      origin,
      expiresInMinutes: CHECKOUT_EXPIRY_MINUTES,
      sourceCode: vivaSourceCode("tickets"),
      tags: ["genbestil", booking.id],
      merchantTrns: `${view.bookingNo} · genbestilling`,
    });

    await createTicketPayment(getDb(), {
      paymentRef: payment.paymentRef,
      flow: "genbestil",
      bookingId: booking.id,
      bookingNo: view.bookingNo,
      customerEmail: customerEmail ?? null,
      customerName: view.name || null,
      expectedTotalOre,
      discountOre,
      lineItems: ledgerLines,
    });

    return NextResponse.json({ url: payment.redirectUrl });
  } catch (err) {
    console.error("Genbestil-checkout fejlede", err);
    return NextResponse.json(
      { error: "Bestillingen kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
