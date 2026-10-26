// Advarsler til kontoret om betalinger, der kræver en hånd.
//
// Begge funktioner er best-effort: de kaster aldrig, så en fejl i selve
// advarslen ikke kan vælte webhooken.

import { sendMail, EMAIL_REPLY_TO } from "@/lib/resend";
import { orderEmailHtml } from "@/lib/order-email";

export type BetalingsType = "Billet" | "Genbestilling" | "Gavekort" | "Bordbestilling";

export interface BeloebsfejlInput {
  type: BetalingsType;
  /** Bookingnummer, gavekortnummer eller fx "Bord 23". */
  reference: string;
  kundeNavn?: string | null;
  kundeEmail?: string | null;
  forventetOre: number;
  betaltOre: number;
  valuta: string;
  transaktionsId: string | null;
}

function kr(ore: number): string {
  return `${Math.round(ore / 100)} kr.`;
}

/** Mailen til kontoret, når Viva har trukket et andet beløb end bestillingen. */
export function beloebsfejlMail(i: BeloebsfejlInput): { subject: string; html: string } {
  const linjer = [
    { description: `Type: ${i.type}`, quantity: 1, amountSubtotalOre: 0 },
    ...(i.kundeNavn
      ? [{ description: `Kunde: ${i.kundeNavn}`, quantity: 1, amountSubtotalOre: 0 }]
      : []),
    ...(i.kundeEmail
      ? [{ description: `Mail: ${i.kundeEmail}`, quantity: 1, amountSubtotalOre: 0 }]
      : []),
    {
      description: `Bestillingen lød på ${kr(i.forventetOre)}`,
      quantity: 1,
      amountSubtotalOre: i.forventetOre,
    },
    {
      description: `Viva har trukket ${kr(i.betaltOre)} (${i.valuta.toUpperCase()})`,
      quantity: 1,
      amountSubtotalOre: i.betaltOre,
    },
    {
      description: `Vivas transaktionsnummer: ${i.transaktionsId ?? "ukendt"}`,
      quantity: 1,
      amountSubtotalOre: 0,
    },
  ];

  return {
    subject: `Betaling kræver handling: beløbet passer ikke – ${i.reference}`,
    html: orderEmailHtml({
      heading: "Kunden har betalt, men beløbet passer ikke",
      bookingNo: i.reference,
      lineItems: linjer,
      discountKr: 0,
      totalLabel: "Handling",
      total: "Send manuelt eller refundér",
      footerNote:
        "Systemet har ikke udleveret noget, fordi det betalte beløb ikke svarer til bestillingen. Kunden har ikke fået besked. Find transaktionen i Viva, og send enten billetten eller gavekortet manuelt, eller refundér betalingen.",
    }),
  };
}

/** Sender beløbsadvarslen til kontoret. Kaster aldrig. */
export async function advarOmBeloebsfejl(i: BeloebsfejlInput): Promise<void> {
  try {
    const { subject, html } = beloebsfejlMail(i);
    await sendMail({ to: EMAIL_REPLY_TO, subject, html });
  } catch (err) {
    console.error("Kunne ikke sende advarsel om beløbsfejl", { reference: i.reference });
  }
}

/**
 * Sender en advarsel til kontoret, når en gæsts genbestilling er betalt og lagt
 * på bookingen, men bekræftelsesmailen til gæsten ikke kunne sendes. Kaster aldrig.
 */
export async function advarOmManglendeBekraeftelse(i: {
  bookingNo: string;
  kundeNavn?: string | null;
  kundeEmail?: string | null;
}): Promise<void> {
  try {
    await sendMail({
      to: EMAIL_REPLY_TO,
      subject: `Gæsten fik ingen bekræftelse – ${i.bookingNo}`,
      html: orderEmailHtml({
        heading: "Bekræftelsen kunne ikke sendes",
        bookingNo: i.bookingNo,
        lineItems: [
          ...(i.kundeNavn
            ? [{ description: `Kunde: ${i.kundeNavn}`, quantity: 1, amountSubtotalOre: 0 }]
            : []),
          ...(i.kundeEmail
            ? [{ description: `Mail: ${i.kundeEmail}`, quantity: 1, amountSubtotalOre: 0 }]
            : []),
        ],
        discountKr: 0,
        totalLabel: "Handling",
        total: "Giv gæsten besked",
        footerNote:
          "Drikkevarerne er betalt og lagt på bookingen i Airtable, men mailen til gæsten kunne ikke sendes. Giv gæsten besked, hvis det er nødvendigt.",
      }),
    });
  } catch (err) {
    console.error("Kunne ikke sende advarsel om manglende bekræftelse", {
      bookingNo: i.bookingNo,
    });
  }
}
