// Køb af gavekort → opret en Viva-betaling og send gæsten til Smart Checkout.
// Browseren sender KUN beløb (hele kroner) og kontaktoplysninger — aldrig en
// færdig pris. Beløbet genberegnes i øre her. Gavekortkoden dannes først, når
// betalingen er bekræftet i webhooken (aldrig her).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { vivaSourceCode } from "@/lib/payments/viva-client";
import { createGiftCard, generateGiftCardNo } from "@/lib/gift-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Grænser for gavekortbeløbet (hele kroner). Bevidst enkle i fase 1.
const MIN_KR = 100;
const MAX_KR = 5000;
const CHECKOUT_EXPIRY_MINUTES = 30;

function looksLikeEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }

  const amountKr = Number(body.amountKr);
  if (!Number.isInteger(amountKr) || amountKr < MIN_KR || amountKr > MAX_KR) {
    return NextResponse.json(
      { error: `Beløbet skal være et helt kronebeløb mellem ${MIN_KR} og ${MAX_KR} kr.` },
      { status: 400 }
    );
  }

  if (!looksLikeEmail(body.recipientEmail)) {
    return NextResponse.json({ error: "Angiv en gyldig e-mail til modtageren." }, { status: 400 });
  }
  const purchaserName = typeof body.purchaserName === "string" ? body.purchaserName.trim() : "";
  if (!purchaserName) {
    return NextResponse.json({ error: "Angiv dit navn." }, { status: 400 });
  }
  if (!looksLikeEmail(body.purchaserEmail)) {
    return NextResponse.json({ error: "Angiv din egen gyldige e-mail." }, { status: 400 });
  }
  if (body.acceptTerms !== true) {
    return NextResponse.json({ error: "Du skal acceptere handelsbetingelserne." }, { status: 400 });
  }

  const purchaserPhone =
    typeof body.purchaserPhone === "string" && body.purchaserPhone.trim()
      ? body.purchaserPhone.trim()
      : null;
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, 300)
      : null;

  const amountOre = amountKr * 100;
  const giftCardNo = generateGiftCardNo();

  try {
    // Live-spærringen (fail-closed) ligger i "tickets"-scopet, som gavekort deler.
    const provider = getPaymentProvider("tickets");
    const payment = await provider.createPayment({
      orderId: giftCardNo,
      orderNumber: giftCardNo,
      eventId: "",
      totalOre: amountOre,
      currency: "dkk",
      description: `Bakkens Hvile · gavekort · ${giftCardNo}`,
      origin: req.nextUrl.origin,
      expiresInMinutes: CHECKOUT_EXPIRY_MINUTES,
      sourceCode: vivaSourceCode("gavekort"),
      tags: ["gavekort"],
      merchantTrns: `${giftCardNo} · gavekort`,
    });

    // Gem den forventede ordre FØR redirect, så webhooken kan beløbskontrollere.
    // Fejler dette, sendes gæsten ikke videre til betaling.
    await createGiftCard(getDb(), {
      paymentRef: payment.paymentRef,
      giftCardNo,
      amountOre,
      purchaserName,
      purchaserEmail: (body.purchaserEmail as string).trim(),
      purchaserPhone,
      recipientEmail: (body.recipientEmail as string).trim(),
      message,
    });

    return NextResponse.json({ url: payment.redirectUrl });
  } catch (err) {
    console.error("Gavekort-checkout fejlede");
    return NextResponse.json(
      { error: "Kunne ikke starte betalingen. Prøv igen om lidt." },
      { status: 500 }
    );
  }
}
