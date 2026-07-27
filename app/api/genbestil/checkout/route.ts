import { NextRequest, NextResponse } from "next/server";
import { listRecords, getRecord, TABLES, FIELDS } from "@/lib/airtable";
import { getStripe } from "@/lib/stripe";
import { addonsTotalDiscountKr, ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import { authenticateBooking, reorderClosed, buildBookingView } from "@/lib/genbestil";

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

    // 5) Stripe-session med kun tilvalgslinjer + rabat-coupon. Markeres som
    //    genbestilling i metadata, så webhooken lægger oven i bookingen frem
    //    for at oprette en ny.
    const origin = req.nextUrl.origin;
    const stripe = getStripe();

    let discountParam: { coupon: string }[] | undefined;
    if (discount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(discount * 100),
        currency: "dkk",
        duration: "once",
        name: ADDON_DISCOUNT_LABEL,
      });
      discountParam = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      locale: "da",
      line_items: lineItems.map((li) => ({
        quantity: li.quantity,
        price_data: {
          currency: "dkk",
          unit_amount: Math.round(li.price * 100),
          product_data: { name: li.name },
        },
      })),
      discounts: discountParam,
      customer_email: customerEmail,
      metadata: {
        reorder: "true",
        bookingId: booking.id,
        bookingNo: view.bookingNo,
      },
      success_url: `${origin}/success?booking=${view.bookingNo}&genbestil=1`,
      cancel_url: `${origin}/genbestil?ref=${encodeURIComponent(
        view.bookingNo
      )}&cancelled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Genbestil-checkout fejlede", err);
    return NextResponse.json(
      { error: "Bestillingen kunne ikke oprettes. Prøv igen." },
      { status: 500 }
    );
  }
}
