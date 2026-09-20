// Varselmailen, der sendes to dage før forestillingen (fra /api/cron/varsel).
//
// Ligger her sammen med de øvrige mails, så den deler det fælles layout og kan
// vises i forhåndsvisningen under /admin uden at sende noget. Teksten er
// uændret fra før omlægningen til det nye design.

import {
  FARVER,
  SKRIFT,
  escapeHtml,
  mailLayout,
  mellemoverskrift,
  overskrift,
} from "@/lib/mail/layout";

const WEEKDAYS = [
  "søndag",
  "mandag",
  "tirsdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lørdag",
];
const MONTHS = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

/** "torsdag den 20. maj 2027". Ukendt dato returneres uændret. */
export function formatDanishDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getUTCDay()]} den ${d.getUTCDate()}. ${
    MONTHS[d.getUTCMonth()]
  } ${d.getUTCFullYear()}`;
}

/** Trækker 30 minutter fra et "HH:MM"-tidspunkt. Returnerer "" hvis ukendt. */
export function doorsTime(time: string): string {
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let mins = Number(m[1]) * 60 + Number(m[2]) - 30;
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

/** En række i varselmailens oversigt: mærkat til venstre, værdi til højre. */
function varselRaekke(maerkat: string, vaerdi: string, sidste = false): string {
  const kant = sidste ? "" : `border-bottom:1px solid ${FARVER.streg};`;
  return `        <tr>
          <td style="padding:11px 0;${kant}font-family:${SKRIFT};font-size:13px;font-style:italic;color:${FARVER.daempet};">${escapeHtml(
    maerkat
  )}</td>
          <td align="right" style="padding:11px 0;${kant}font-family:${SKRIFT};font-size:15px;color:${FARVER.blaek};">${escapeHtml(
    vaerdi
  )}</td>
        </tr>`;
}

export interface VarselEmailParams {
  customerName: string;
  showDate: string;
  showTime: string;
  reorderUrl: string;
}

export function varselEmailHtml(params: VarselEmailParams): string {
  const { customerName, showDate, showTime, reorderUrl } = params;
  const doors = doorsTime(showTime);
  const dateLong = formatDanishDate(showDate);

  const indhold = `${overskrift(
    `Vi glæder os til at se dig${customerName ? ", " + customerName : ""}!`
  )}
      <p style="margin:0 0 26px;font-family:${SKRIFT};font-size:16px;line-height:25px;color:${FARVER.blaek};">
        Om to dage løber dit show af stablen. Her er det praktiske, så I får den
        bedst mulige aften.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${FARVER.guld};">
${varselRaekke("Dato", dateLong)}
${varselRaekke("Showstart", `kl. ${showTime}`)}
${varselRaekke(
  "Dørene åbner",
  `${doors ? "kl. " + doors : "en halv time før showstart"} (en halv time før)`,
  true
)}
      </table>

${mellemoverskrift("Drikkevarer", "32px 0 10px")}
      <p style="margin:0 0 18px;font-family:${SKRIFT};font-size:15px;line-height:24px;color:${FARVER.blaek};">
        Husk, at du kan bestille drikkevarer online med 10 % rabat indtil
        kl. 12.00 på forestillingsdagen. Herefter — og ved bestilling via
        QR-systemet eller ved bordet — gælder de almindelige priser.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr><td align="center" bgcolor="${FARVER.guld}" style="background:${FARVER.guld};padding:13px 24px;">
          <a href="${escapeHtml(
            reorderUrl
          )}" style="font-family:${SKRIFT};font-size:15px;font-weight:bold;color:${FARVER.groen};text-decoration:none;">Bestil drikkevarer online</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-family:${SKRIFT};font-size:15px;line-height:24px;color:${FARVER.blaek};">
        Forudbestilte drikkevarer står klar ved bordet, når I ankommer.
      </p>
      <p style="margin:0 0 26px;font-family:${SKRIFT};font-size:15px;line-height:24px;color:${FARVER.blaek};">
        Bestilling i salen sker udelukkende ved bordene via tjenerne eller via
        QR-koden — ikke ved baren.
      </p>

      <p style="margin:0 0 4px;font-family:${SKRIFT};font-size:15px;line-height:24px;color:${FARVER.blaek};">
        Mange varme hilsner
      </p>
      <p style="margin:0;font-family:${SKRIFT};font-style:italic;font-size:18px;line-height:26px;color:${FARVER.groen};">
        Dot Wessman
      </p>`;

  return mailLayout({
    title: "Vi glæder os til at se dig i Bakkens Hvile",
    preheader: `Din forestilling er ${dateLong} kl. ${showTime}.`,
    indhold,
  });
}
