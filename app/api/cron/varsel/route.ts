import { NextRequest, NextResponse } from "next/server";
import {
  listRecords,
  getRecord,
  updateRecord,
  TABLES,
  FIELDS,
} from "@/lib/airtable";
import { sendMail } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

// Dagens dato i dansk tid + n dage, som YYYY-MM-DD. Cron kører 08:00 UTC,
// hvor det stadig er samme kalenderdag i Danmark.
function danishDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const base = new Date(`${today}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDanishDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getUTCDay()]} den ${d.getUTCDate()}. ${
    MONTHS[d.getUTCMonth()]
  } ${d.getUTCFullYear()}`;
}

// Trækker 30 minutter fra et "HH:MM"-tidspunkt. Returnerer "" hvis ukendt.
function doorsTime(time: string): string {
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let mins = Number(m[1]) * 60 + Number(m[2]) - 30;
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

function statusName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return String((value as { name?: unknown }).name ?? "");
  }
  return "";
}

function varselEmailHtml(params: {
  customerName: string;
  showDate: string;
  showTime: string;
  reorderUrl: string;
}): string {
  const { customerName, showDate, showTime, reorderUrl } = params;
  const doors = doorsTime(showTime);
  const dateLong = formatDanishDate(showDate);

  return `
  <div style="font-family:Georgia,serif;background:#f6f1e4;padding:32px;color:#1a1a16;">
    <div style="max-width:560px;margin:0 auto;background:#0d3b2e;border-radius:4px;padding:32px;color:#f6f1e4;">
      <p style="letter-spacing:0.15em;text-transform:uppercase;font-size:12px;color:#c9a227;margin:0 0 8px;">
        Bakkens Hvile · Underholdning siden 1877
      </p>
      <h1 style="margin:0 0 16px;font-size:24px;">Vi glæder os til at se dig${
        customerName ? ", " + customerName : ""
      }!</h1>

      <p style="font-size:15px;line-height:1.7;color:#f6f1e4;margin:0 0 20px;">
        Om to dage løber dit show af stablen. Her er det praktiske, så I får den
        bedst mulige aften.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 24px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(201,162,39,0.3);color:#c9a227;">Dato</td>
          <td style="padding:8px 0;border-bottom:1px solid rgba(201,162,39,0.3);text-align:right;">${dateLong}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(201,162,39,0.3);color:#c9a227;">Showstart</td>
          <td style="padding:8px 0;border-bottom:1px solid rgba(201,162,39,0.3);text-align:right;">kl. ${showTime}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#c9a227;">Dørene åbner</td>
          <td style="padding:8px 0;text-align:right;">${
            doors ? "kl. " + doors : "en halv time før showstart"
          } (en halv time før)</td>
        </tr>
      </table>

      <h2 style="font-size:17px;color:#c9a227;margin:0 0 10px;">Drikkevarer</h2>
      <p style="font-size:14px;line-height:1.7;color:#d8d3c2;margin:0 0 14px;">
        Drikkevarer bestilt online er 10% billigere end bestilt i salen. Har du
        ikke allerede bestilt, kan det nås frem til kl. 12.00 på selve showdagen:
      </p>
      <p style="margin:0 0 18px;">
        <a href="${reorderUrl}" style="display:inline-block;background:#c9a227;color:#0d3b2e;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:4px;font-size:14px;">
          Bestil drikkevarer online
        </a>
      </p>
      <p style="font-size:14px;line-height:1.7;color:#d8d3c2;margin:0 0 6px;">
        Forudbestilte drikkevarer står klar ved bordet, når I ankommer.
      </p>
      <p style="font-size:14px;line-height:1.7;color:#d8d3c2;margin:0 0 24px;">
        Bestilling i salen sker udelukkende ved bordene via tjenerne — ikke ved
        baren.
      </p>

      <p style="font-size:15px;line-height:1.7;color:#f6f1e4;margin:24px 0 4px;">
        Mange varme hilsner
      </p>
      <p style="font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:18px;color:#c9a227;margin:0;">
        Dot Wessman
      </p>
      <p style="font-size:13px;color:#d8d3c2;margin-top:24px;">
        Bakkens Hvile, Dyrehavsbakken 38, 2930 Klampenborg.
      </p>
    </div>
  </div>`;
}

export async function GET(req: NextRequest) {
  // Beskyttelse: kun kald med korrekt CRON_SECRET slipper igennem.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Uautoriseret" }, { status: 401 });
  }

  const origin = process.env.SITE_URL || req.nextUrl.origin;
  const target = danishDatePlus(2);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const events = await listRecords(TABLES.events);
    const todaysShows = events.filter(
      (e) => String(e.fields[FIELDS.event.date] ?? "") === target
    );

    for (const event of todaysShows) {
      const showDate = String(event.fields[FIELDS.event.date] ?? "");
      const showTime = String(event.fields[FIELDS.event.time] ?? "");
      const bookingIds =
        (event.fields[FIELDS.event.bookings] as string[] | undefined) ?? [];

      for (const bookingId of bookingIds) {
        // Fejl håndteres pr. booking, så én fejlet mail ikke stopper resten.
        try {
          const booking = await getRecord(TABLES.bookings, bookingId);
          if (statusName(booking.fields[FIELDS.booking.status]) !== "Betalt") {
            skipped++;
            continue;
          }
          if (booking.fields[FIELDS.booking.varselSent]) {
            skipped++;
            continue;
          }
          const custId = (booking.fields[FIELDS.booking.customer] as
            | string[]
            | undefined)?.[0];
          if (!custId) {
            skipped++;
            continue;
          }
          const cust = await getRecord(TABLES.customers, custId);
          const email = String(cust.fields[FIELDS.customer.email] ?? "").trim();
          if (!email) {
            skipped++;
            continue;
          }
          const bookingNo = String(booking.fields[FIELDS.booking.bookingNo] ?? "");
          const key = String(booking.fields[FIELDS.booking.key] ?? "");
          const reorderUrl = `${origin}/genbestil?ref=${encodeURIComponent(
            bookingNo
          )}&n=${encodeURIComponent(key)}`;

          await sendMail({
            to: email,
            subject: `Vi glæder os til at se dig — Bakkens Hvile ${formatDanishDate(
              showDate
            )}`,
            html: varselEmailHtml({
              customerName: String(cust.fields[FIELDS.customer.name] ?? ""),
              showDate,
              showTime,
              reorderUrl,
            }),
          });

          await updateRecord(TABLES.bookings, bookingId, {
            [FIELDS.booking.varselSent]: true,
          });
          sent++;
        } catch (err) {
          console.error(`Varselmail fejlede for booking ${bookingId}`, err);
          failed++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      target,
      shows: todaysShows.length,
      sent,
      failed,
      skipped,
    });
  } catch (err) {
    console.error("Varsel-cron fejlede", err);
    return NextResponse.json(
      { error: "Varsel-cron fejlede", sent, failed, skipped },
      { status: 500 }
    );
  }
}
