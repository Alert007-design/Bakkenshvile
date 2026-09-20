// Forhåndsvisning af husets mails med eksempeldata — uden at sende noget.
//
// Siden ligger under /admin og er derfor bag personalelogin (middleware.ts).
// Den kalder hverken Airtable, Resend eller betalingsudbyderen: hver mail
// bygges af de samme funktioner som i produktion, blot med eksempelværdier.
// Bruges til at se udseendet, før en ændring går live.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { ticketEmailHtml } from "@/lib/ticket-email";
import {
  giftCardRecipientEmailHtml,
  giftCardPurchaserEmailHtml,
} from "@/lib/gift-card-email";
import { orderEmailHtml } from "@/lib/order-email";
import { varselEmailHtml } from "@/lib/mail/varsel-email";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Eksempelmails. Emnelinjerne er de samme, som koden sender i produktion. */
function eksempler(): { navn: string; emne: string; html: string }[] {
  const billetLinjer = [
    {
      description: "Billet: B (10. række) — tor 20. maj kl. 20:00",
      quantity: 1,
      amountSubtotalOre: 31900,
    },
    {
      description: "Danskvand med citrus",
      quantity: 1,
      amountSubtotalOre: 5000,
    },
  ];

  return [
    {
      navn: "Billet (med onlinerabat og jubilæumsbånd)",
      emne: "Din billet til Bakkens Hvile 20. maj 2027 — BH-31608747",
      html: ticketEmailHtml({
        customerName: "Morten Messerschmidt",
        bookingNo: "BH-31608747",
        showTitle: "150 års jubilæums show 2027",
        showDateIso: "2027-05-20",
        showTime: "20:00",
        seats: "B (10. række) × 1",
        isJubilee: true,
        lineItems: billetLinjer,
        subtotalKr: 369,
        discountKr: 5,
        totalKr: 364,
        discountLabel: ADDON_DISCOUNT_LABEL,
      }),
    },
    {
      navn: "Billet (uden rabat, uden jubilæumsbånd)",
      emne: "Din billet til Bakkens Hvile 12. august 2026 — BH-31608748",
      html: ticketEmailHtml({
        customerName: "Dot Wessman",
        bookingNo: "BH-31608748",
        showTitle: "Sommershow 2026",
        showDateIso: "2026-08-12",
        showTime: "19:30",
        seats: "A+ (1.-2.-3. række) × 2",
        isJubilee: false,
        lineItems: [
          {
            description: "Billet: A+ (1.-2.-3. række) — ons 12. august kl. 19:30",
            quantity: 2,
            amountSubtotalOre: 91800,
          },
        ],
        subtotalKr: 918,
        discountKr: 0,
        totalKr: 918,
        discountLabel: ADDON_DISCOUNT_LABEL,
      }),
    },
    {
      navn: "Gavekort til modtageren (med personlig hilsen)",
      emne: "Du har fået et gavekort til Bakkens Hvile",
      html: giftCardRecipientEmailHtml({
        code: "BH-TU3T-YN3N",
        amountKr: 100,
        expiresIso: "2029-09-20T00:00:00.000Z",
        purchaserName: "Morten Messerschmidt",
        message: "Tillykke med fødselsdagen — glæd dig, det er en fest!",
      }),
    },
    {
      navn: "Gavekort til modtageren (uden hilsen)",
      emne: "Du har fået et gavekort til Bakkens Hvile",
      html: giftCardRecipientEmailHtml({
        code: "BH-9K2M-QP4X",
        amountKr: 500,
        expiresIso: "2029-09-20T00:00:00.000Z",
        purchaserName: "Dot Wessman",
        message: null,
      }),
    },
    {
      navn: "Kvittering for gavekort (til køberen)",
      emne: "Kvittering for dit gavekort — GK-30728637",
      html: giftCardPurchaserEmailHtml({
        giftCardNo: "GK-30728637",
        amountKr: 100,
        recipientEmail: "modtager@example.com",
        expiresIso: "2029-09-20T00:00:00.000Z",
      }),
    },
    {
      navn: "Ekstra bestilling af drikkevarer (genbestilling)",
      emne: "Din ekstra bestilling til Bakkens Hvile — BH-31608747",
      html: orderEmailHtml({
        heading: "Tak for din ekstra bestilling, Morten Messerschmidt!",
        bookingNo: "BH-31608747",
        lineItems: [
          { description: "Husets hvidvin", quantity: 2, amountSubtotalOre: 19000 },
          { description: "Danskvand med citrus", quantity: 1, amountSubtotalOre: 5000 },
        ],
        discountKr: 24,
        totalLabel: "Betalt nu",
        total: "216 kr.",
        grandTotal: "580 kr.",
        footerNote:
          "Vi har lagt drikkevarerne til din bestilling. Vi glæder os til at se dig i Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.",
      }),
    },
    {
      navn: "Varselmail (to dage før forestillingen)",
      emne: "Vi glæder os til at se dig — Bakkens Hvile torsdag den 20. maj 2027",
      html: varselEmailHtml({
        customerName: "Morten Messerschmidt",
        showDate: "2027-05-20",
        showTime: "20:00",
        reorderUrl: "https://bakkenshvile.vercel.app/genbestil?ref=BH-31608747&n=eksempel",
      }),
    },
  ];
}

export default function MailForhaandsvisning() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/mailforhandsvisning");

  const mails = eksempler();

  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "32px 24px 80px",
        fontFamily: "system-ui, sans-serif",
        color: "#1a1a16",
      }}
    >
      <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Forhåndsvisning af mails</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 4px" }}>
        Sådan ser husets mails ud med eksempeldata. Der bliver ikke sendt noget
        fra denne side, og der hentes hverken kunder, bookinger eller beløb.
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: "#6b6858", margin: "0 0 32px" }}>
        Vil du se, hvordan en mail tager sig ud i dit eget mailprogram, kan du
        bruge knappen &quot;Gensend billet&quot; på adminsiden til en rigtig
        booking.
      </p>

      {mails.map((m) => (
        <section key={m.navn} style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>{m.navn}</h2>
          <p
            style={{
              fontSize: 13,
              color: "#6b6858",
              margin: "0 0 10px",
              fontFamily: "monospace",
            }}
          >
            Emne: {m.emne}
          </p>
          {/* sandbox uden tilladelser: forhåndsvisningen kan intet køre. */}
          <iframe
            title={m.navn}
            srcDoc={m.html}
            sandbox=""
            style={{
              width: "100%",
              height: 860,
              border: "1px solid #d8d3c2",
              background: "#fff",
            }}
          />
        </section>
      ))}
    </main>
  );
}
