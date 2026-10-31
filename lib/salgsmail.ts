// Kort mail til Dot ved hvert gennemført salg på hjemmesiden, så salget kan
// følges løbende. Gælder billetkøb, drikkevarer købt online og gavekort — ikke
// QR-bestillinger fra bordene i salen.
//
// Mailen viser billetter og drikkevarer hver for sig, fordi drikkevarer købt
// sammen med billetter afregnes til billetkontoen og evt. skal flyttes.
//
// Best-effort: kaster aldrig, så en fejl her ikke kan vælte en betaling.

import { sendMail } from "@/lib/resend";
import { orderEmailHtml } from "@/lib/order-email";
import type { TicketPaymentRow } from "@/lib/ticket-payments";
import type { GiftCardRow } from "@/lib/gift-cards";

export const SALGSMAIL_TIL = "dot@bakkenshvile.dk";

export type SalgsType = "Billetkøb" | "Drikkevarer" | "Gavekort";

export interface Salg {
  type: SalgsType;
  reference: string;
  kundeNavn: string | null;
  kundeEmail: string | null;
  totalOre: number;
  /** Beløb for billetter inkl. gebyr. null = kan ikke opdeles (ældre data). */
  billetterOre: number | null;
  /** Beløb for drikkevarer efter onlinerabat. null = kan ikke opdeles. */
  drikkevarerOre: number | null;
  /** Hvilken konto pengene afregnes til i Viva. */
  konto: "Billetkontoen" | "Barkontoen";
}

function kr(ore: number): string {
  return `${Math.round(ore / 100).toLocaleString("da-DK")} kr.`;
}

/** Salget ud fra en betalt billet- eller genbestilling. */
export function salgFraBillet(p: TicketPaymentRow): Salg {
  if (p.flow === "genbestil") {
    return {
      type: "Drikkevarer",
      reference: p.bookingNo,
      kundeNavn: p.customerName,
      kundeEmail: p.customerEmail,
      totalOre: p.expectedTotalOre,
      billetterOre: 0,
      drikkevarerOre: p.expectedTotalOre,
      konto: "Barkontoen",
    };
  }
  // Billetkøb: rabatten gælder kun drikkevarer, så den trækkes fra dem.
  const kendt = p.lineItems.length > 0 && p.lineItems.every((l) => l.kind);
  const drinksBrutto = p.lineItems
    .filter((l) => l.kind === "addon")
    .reduce((s, l) => s + l.amountSubtotalOre, 0);
  const drikkevarerOre = kendt ? Math.max(0, drinksBrutto - p.discountOre) : null;
  return {
    type: "Billetkøb",
    reference: p.bookingNo,
    kundeNavn: p.customerName,
    kundeEmail: p.customerEmail,
    totalOre: p.expectedTotalOre,
    billetterOre: drikkevarerOre === null ? null : p.expectedTotalOre - drikkevarerOre,
    drikkevarerOre,
    konto: "Billetkontoen",
  };
}

/** Salget ud fra et betalt gavekort. */
export function salgFraGavekort(c: GiftCardRow): Salg {
  return {
    type: "Gavekort",
    reference: c.giftCardNo,
    kundeNavn: c.purchaserName,
    kundeEmail: c.purchaserEmail,
    totalOre: c.amountOre,
    billetterOre: null,
    drikkevarerOre: null,
    konto: "Barkontoen",
  };
}

export function salgsmail(s: Salg): { subject: string; html: string } {
  const linje = (description: string, ore = 0) => ({
    description,
    quantity: 1,
    amountSubtotalOre: ore,
  });
  const linjer = [
    ...(s.kundeNavn ? [linje(`Kunde: ${s.kundeNavn}`)] : []),
    ...(s.kundeEmail ? [linje(`Mail: ${s.kundeEmail}`)] : []),
  ];
  if (s.type === "Billetkøb") {
    if (s.billetterOre !== null && s.drikkevarerOre !== null) {
      linjer.push(linje("Billetter inkl. gebyr", s.billetterOre));
      if (s.drikkevarerOre > 0) {
        linjer.push(linje("Drikkevarer efter onlinerabat", s.drikkevarerOre));
      }
    } else {
      linjer.push(linje("Billetter og evt. drikkevarer", s.totalOre));
    }
  } else {
    linjer.push(linje(s.type, s.totalOre));
  }
  linjer.push(linje(`Afregnes til: ${s.konto}`));

  const drinksNote =
    s.type === "Billetkøb" && s.drikkevarerOre
      ? ` Drikkevarerne (${kr(s.drikkevarerOre)}) er betalt sammen med billetterne og afregnes derfor til billetkontoen.`
      : "";

  return {
    subject: `Nyt salg: ${s.type} ${kr(s.totalOre)} – ${s.reference}`,
    html: orderEmailHtml({
      heading: `Nyt salg på hjemmesiden: ${s.type.toLowerCase()}`,
      bookingNo: s.reference,
      lineItems: linjer,
      discountKr: 0,
      totalLabel: "Betalt i alt",
      total: kr(s.totalOre),
      footerNote: `Betalingen er gennemført hos Viva.${drinksNote}`,
    }),
  };
}

/** Sender salgsmailen til Dot. Kaster aldrig. */
export async function meldSalg(s: Salg): Promise<void> {
  try {
    const { subject, html } = salgsmail(s);
    await sendMail({ to: SALGSMAIL_TIL, subject, html });
  } catch (err) {
    console.error("Kunne ikke sende salgsmail", { reference: s.reference });
  }
}
