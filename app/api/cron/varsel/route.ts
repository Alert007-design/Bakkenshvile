import { NextRequest, NextResponse } from "next/server";
import {
  listRecords,
  getRecord,
  updateRecord,
  TABLES,
  FIELDS,
} from "@/lib/airtable";
import { danishToday } from "@/lib/events";
import { sendMail } from "@/lib/resend";
import { siteUrl } from "@/lib/site-url";
// Selve mailen bygges i lib/mail/varsel-email.ts, så den deler layout med
// husets øvrige mails og kan ses i forhåndsvisningen under /admin.
import { formatDanishDate, varselEmailHtml } from "@/lib/mail/varsel-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dagens dato i dansk tid + n dage, som YYYY-MM-DD. Cron kører 08:00 UTC,
// hvor det stadig er samme kalenderdag i Danmark. Dagens dato genbruges fra
// den fælles kilde (lib/events), så dansk-tid-logikken kun findes ét sted.
function danishDatePlus(days: number): string {
  const today = danishToday();
  const base = new Date(`${today}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function statusName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return String((value as { name?: unknown }).name ?? "");
  }
  return "";
}

export async function GET(req: NextRequest) {
  // Beskyttelse: kun kald med korrekt CRON_SECRET slipper igennem.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Uautoriseret" }, { status: 401 });
  }

  const origin = siteUrl();
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
