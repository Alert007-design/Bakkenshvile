// Kort mail til Dot ved hvert gennemført salg på hjemmesiden, så salget kan
// følges løbende. Gælder billetkøb, drikkevarer købt online og gavekort — ikke
// QR-bestillinger fra bordene i salen.
//
// Mailen viser billetter og drikkevarer hver for sig, fordi drikkevarer købt
// sammen med billetter afregnes til billetkontoen og evt. skal flyttes.
//
// Best-effort: kaster aldrig, så en fejl her ikke kan vælte en betaling.

import { sendMail } from "@/lib/resend";
import type { TicketLineItem, TicketPaymentRow } from "@/lib/ticket-payments";
import type { GiftCardRow } from "@/lib/gift-cards";
import { ADDON_DISCOUNT_LABEL } from "@/lib/pricing";
import { daDateLong, pladserTekst } from "@/lib/ticket-email";
import {
  FARVER,
  SKRIFT,
  escapeHtml,
  ialtLinje,
  mailLayout,
  mellemoverskrift,
  momsNote,
  overskrift,
  varelinje,
} from "@/lib/mail/layout";

export const SALGSMAIL_TIL = "dot@bakkenshvile.dk";

export type SalgsType = "Billetkøb" | "Drikkevarer" | "Gavekort";

/** Forestillingen, billetterne gælder. Hentes fra bookingen i Airtable. */
export interface Forestilling {
  titel: string;
  datoIso: string;
  tid: string;
  /** Som gemt i bookingen, fx "A (7.-8.-9. række) x1". */
  pladser: string;
  /** Kundens adresse fra kunderækken (tomme felter, hvis ikke oplyst). */
  kundeAdresse?: { adresse: string; postnummer: string; by: string };
}

export interface Salg {
  type: SalgsType;
  reference: string;
  kundeNavn: string | null;
  kundeEmail: string | null;
  kundeTelefon?: string | null;
  totalOre: number;
  /** Beløb for billetter inkl. gebyr. null = kan ikke opdeles (ældre data). */
  billetterOre: number | null;
  /** Beløb for drikkevarer efter onlinerabat. null = kan ikke opdeles. */
  drikkevarerOre: number | null;
  /** Hvilken konto pengene afregnes til i Viva. */
  konto: "Billetkontoen" | "Barkontoen";
  /** De enkelte varer, kunden har købt (beløb før rabat). */
  varer: TicketLineItem[];
  /** Onlinerabat på drikkevarer i øre. */
  rabatOre: number;
  /** Kun billetkøb: forestilling og pladser, hvis de kunne hentes. */
  forestilling?: Forestilling | null;
  /** Kundens adresse fra Airtable, hvis den er oplyst. */
  kundeAdresse?: { adresse: string; postnummer: string; by: string } | null;
  /** Kun gavekort. */
  gavekort?: {
    modtagerEmail: string;
    hilsen: string | null;
    udloeberIso: string | null;
  } | null;
}

function kr(ore: number): string {
  return `${Math.round(ore / 100).toLocaleString("da-DK")} kr.`;
}

/** Salget ud fra en betalt billet- eller genbestilling. */
export function salgFraBillet(
  p: TicketPaymentRow,
  forestilling: Forestilling | null = null
): Salg {
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
      varer: p.lineItems,
      rabatOre: p.discountOre,
      forestilling,
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
    varer: p.lineItems,
    rabatOre: p.discountOre,
    forestilling,
    kundeAdresse: forestilling?.kundeAdresse ?? null,
  };
}

/** Salget ud fra et betalt gavekort. */
export function salgFraGavekort(c: GiftCardRow): Salg {
  return {
    type: "Gavekort",
    reference: c.giftCardNo,
    kundeNavn: c.purchaserName,
    kundeEmail: c.purchaserEmail,
    kundeTelefon: c.purchaserPhone ?? null,
    totalOre: c.amountOre,
    billetterOre: null,
    drikkevarerOre: null,
    konto: "Barkontoen",
    varer: [
      {
        description: `Gavekort på ${kr(c.amountOre)}`,
        quantity: 1,
        amountSubtotalOre: c.amountOre,
      },
    ],
    rabatOre: 0,
    gavekort: {
      modtagerEmail: c.recipientEmail,
      hilsen: c.message ?? null,
      udloeberIso: c.expiresAt ?? null,
    },
  };
}

/** En række med mærkat til venstre og værdi til højre (ingen antal/beløb). */
function infoRaekke(maerkat: string, vaerdi: string): string {
  return `        <tr>
          <td valign="top" width="150" style="width:150px;padding:8px 12px 8px 0;border-bottom:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:14px;line-height:21px;font-style:italic;color:${FARVER.daempet};">${escapeHtml(
    maerkat
  )}</td>
          <td valign="top" style="padding:8px 0;border-bottom:1px solid ${FARVER.streg};font-family:${SKRIFT};font-size:15px;line-height:21px;color:${FARVER.blaek};">${escapeHtml(
    vaerdi
  )}</td>
        </tr>`;
}

function infoTabel(raekker: [string, string | null | undefined][]): string {
  const synlige = raekker.filter(([, v]) => v);
  if (synlige.length === 0) return "";
  return `      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${synlige.map(([m, v]) => infoRaekke(m, String(v))).join("\n")}
      </table>`;
}

function datoTekst(iso: string | null | undefined): string {
  if (!iso) return "";
  return daDateLong(String(iso).slice(0, 10));
}

export function salgsmail(s: Salg): { subject: string; html: string } {
  const kunde = infoTabel([
    ["Navn", s.kundeNavn],
    ["Mail", s.kundeEmail],
    ["Telefon", s.kundeTelefon],
    ["Adresse", s.kundeAdresse?.adresse],
    [
      "Postnummer og by",
      [s.kundeAdresse?.postnummer, s.kundeAdresse?.by].filter(Boolean).join(" "),
    ],
  ]);

  const f = s.forestilling;
  const forestilling = f
    ? `${mellemoverskrift("Forestilling")}
${infoTabel([
  ["Forestilling", f.titel],
  ["Dato", datoTekst(f.datoIso)],
  ["Klokken", f.tid ? `kl. ${f.tid}` : ""],
  ["Pladser", pladserTekst(f.pladser)],
])}`
    : "";

  const g = s.gavekort;
  const gavekort = g
    ? `${mellemoverskrift("Gavekortet")}
${infoTabel([
  ["Sendt til", g.modtagerEmail],
  ["Gyldigt til", datoTekst(g.udloeberIso)],
  ["Hilsen", g.hilsen],
])}`
    : "";

  const rabatLinje =
    s.rabatOre > 0
      ? `        <tr>
          <td colspan="2" style="padding:12px 0 10px;font-family:${SKRIFT};font-size:14px;color:${FARVER.groen};">${escapeHtml(
          ADDON_DISCOUNT_LABEL
        )}</td>
          <td align="right" style="padding:12px 0 10px;font-family:${SKRIFT};font-size:14px;color:${FARVER.groen};white-space:nowrap;">&minus;${escapeHtml(
          kr(s.rabatOre)
        )}</td>
        </tr>`
      : "";

  const varer =
    s.varer.length > 0
      ? s.varer.map(varelinje).join("\n")
      : varelinje({ description: s.type, quantity: 1, amountSubtotalOre: s.totalOre });

  const fordeling: [string, string | null][] = [];
  if (s.type === "Billetkøb") {
    if (s.billetterOre !== null && s.drikkevarerOre !== null) {
      fordeling.push(["Billetter inkl. gebyr", kr(s.billetterOre)]);
      fordeling.push(["Drikkevarer efter rabat", kr(s.drikkevarerOre)]);
    } else {
      fordeling.push(["Billetter og drikkevarer", kr(s.totalOre)]);
    }
  }
  fordeling.push(["Afregnes til", s.konto]);

  const drinksNote =
    s.type === "Billetkøb" && s.drikkevarerOre
      ? ` Drikkevarerne (${kr(s.drikkevarerOre)}) er betalt sammen med billetterne og afregnes derfor til billetkontoen.`
      : "";

  const indhold = `${overskrift(`Nyt salg på hjemmesiden: ${s.type.toLowerCase()}`, "0 0 6px")}
      <p style="margin:0 0 24px;font-family:${SKRIFT};font-size:15px;line-height:22px;color:${FARVER.daempet};">Ordrenummer <strong style="color:${FARVER.groen};letter-spacing:1px;">${escapeHtml(
    s.reference
  )}</strong></p>

${mellemoverskrift("Kunde", "0 0 8px")}
${kunde}
${forestilling}
${gavekort}

${mellemoverskrift("Det er købt")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${varer}
${rabatLinje}
${ialtLinje("Betalt i alt", kr(s.totalOre))}
      </table>
${momsNote(
  "Alle priser er inklusive 25 % moms. Momsbeløbet svarer til 20 % af den samlede pris inklusive moms."
)}

${mellemoverskrift("Afregning")}
${infoTabel(fordeling)}

      <p style="margin:26px 0 0;font-family:${SKRIFT};font-size:15px;line-height:24px;color:${FARVER.blaek};">${escapeHtml(
    `Betalingen er gennemført hos Viva.${drinksNote}`
  )}</p>`;

  return {
    subject: `Nyt salg: ${s.type} ${kr(s.totalOre)} – ${s.reference}`,
    html: mailLayout({
      title: `Nyt salg: ${s.type}`,
      preheader: `${s.reference} – betalt i alt ${kr(s.totalOre)}`,
      indhold,
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
