// Stories på Facebook og Instagram: dagens to billeder, om de lægges op
// (kladde eller live), og hvad der er sket de seneste dage. Bag personalelogin.
// Siden ændrer intet; tilstand og godkendte skabeloner styres i Vercel.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSession, STAFF_COOKIE_NAME } from "@/lib/staff-auth";
import { getDb } from "@/lib/db";
import { danishToday } from "@/lib/events";
import { hentLog, type LogLinje } from "@/lib/stories/log";
import { laesIndstillinger } from "@/lib/stories/koersel";
import { CRON_MANGLER_BESKED, cronKanKoere } from "@/lib/cron-auth";
import LaegOpNu from "./LaegOpNu";
import { plusDage, STORY_TYPER, SLOT_TIME, SLOTS, type Slot } from "@/lib/stories/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Metas adgang ("Data Access Expires") udløber, hvis Dot ikke har brugt appen
// i 90 dage. Aflæst i Metas Access Token Debugger 15-11-2026.
const META_ADGANG_UDLOEBER = "2027-02-13";

const TYPENAVN: Record<string, string> = {
  nedtaelling: "Nedtælling",
  "i-aften": "I aften",
  gavekort: "Gavekort",
  billetter: "Billetter til næste sæson",
  pladser: "Ledige pladser",
  ukendt: "Ukendt",
};
const STATUSNAVN: Record<string, string> = {
  i_gang: "I gang",
  lagt: "Lagt op",
  fejl: "Fejl",
  kladde: "Kladde (ikke lagt op)",
};
const SLOTNAVN: Record<Slot, string> = { morgen: "Kl. 8.25", eftermiddag: "Kl. 16.25" };

export default async function StoriesSide() {
  let session = null;
  try {
    session = verifyStaffSession(cookies().get(STAFF_COOKIE_NAME)?.value);
  } catch {
    session = null;
  }
  if (!session) redirect("/login?next=/admin/stories");

  const ind = laesIndstillinger(process.env);
  const iDag = danishToday();

  let log: LogLinje[] = [];
  let logFejl = "";
  try {
    log = await hentLog(getDb(), 40);
  } catch {
    logFejl =
      "Loggen kan ikke læses. Er migration 009_story_log.sql kørt i databasen? Indtil da kan intet lægges op.";
  }

  const dageTilFornyelse = Math.round(
    (Date.parse(`${META_ADGANG_UDLOEBER}T12:00:00Z`) - Date.parse(`${iDag}T12:00:00Z`)) / 86_400_000
  );
  const noegleFejl = log.some((l) => l.status === "fejl" && /190|udløb|expired|session/i.test(l.besked ?? ""));
  const nyligeFejl = log.filter((l) => l.status === "fejl" && l.dato >= plusDage(iDag, -7));

  const boks = { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 };
  const advarsel = { ...boks, background: "#fdecea", borderColor: "#e0a39b", color: "#7a1f14" };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 20, fontFamily: "system-ui, sans-serif", color: "#222" }}>
      <p style={{ fontSize: 14 }}>
        <a href="/admin" style={{ color: "#0d3b2e", fontWeight: 600 }}>← Admin</a>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Stories på Facebook og Instagram</h1>

      <div style={boks}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Tilstand:</strong>{" "}
          {ind.tilstand === "live" ? "Live – godkendte stories lægges op" : ind.tilstand === "fra" ? "Slået fra" : "Kladde – billederne laves, men intet lægges op"}
        </p>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Godkendt til live:</strong>{" "}
          {ind.godkendt.length ? ind.godkendt.map((t) => TYPENAVN[t]).join(", ") : "ingen endnu"}
          <span style={{ color: "#666" }}> (mulige: {STORY_TYPER.map((t) => TYPENAVN[t]).join(", ")})</span>
        </p>
        <p style={{ margin: 0 }}>
          <strong>Nøgle til Meta:</strong> {ind.noegle ? "sat i Vercel" : "mangler i Vercel (META_PAGE_TOKEN)"}
        </p>
      </div>

      {!cronKanKoere(process.env) && (
        <div style={advarsel}>
          <strong>Stories kører ikke af sig selv.</strong> {CRON_MANGLER_BESKED}
        </div>
      )}
      {logFejl && <div style={advarsel}>{logFejl}</div>}
      {noegleFejl && (
        <div style={advarsel}>
          Meta har afvist nøglen. Dot skal logge ind på developers.facebook.com, og der skal laves en ny nøgle til Vercel.
        </div>
      )}
      {dageTilFornyelse <= 21 && (
        <div style={advarsel}>
          Metas adgang skal fornyes senest {META_ADGANG_UDLOEBER.split("-").reverse().join("-")}
          {dageTilFornyelse >= 0 ? ` (om ${dageTilFornyelse} dage)` : " (overskredet)"}. Dot skal logge ind på
          developers.facebook.com og åbne appen Bakkens Hvile Stories.
        </div>
      )}
      {nyligeFejl.length > 0 && (
        <div style={advarsel}>
          {nyligeFejl.length} fejl de seneste 7 dage. Se loggen nederst. Fejl prøves ikke igen af sig selv.
        </div>
      )}

      <h2 style={{ fontSize: 18 }}>I dag</h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        {SLOTS.map((slot) => (
          <figure key={slot} style={{ margin: 0, width: 260 }}>
            <figcaption style={{ fontWeight: 600, marginBottom: 6 }}>
              {SLOTNAVN[slot]} ({SLOT_TIME[slot]}.25 dansk tid)
            </figcaption>
            {/* Viser "ingen story i dag", hvis billedet ikke findes (404). */}
            <object
              data={`/stories/billede/${slot}/${iDag}.jpg`}
              type="image/jpeg"
              style={{ width: 260, height: 462, background: "#141B36", borderRadius: 8 }}
            >
              <div style={{ width: 260, height: 462, display: "flex", alignItems: "center", justifyContent: "center", background: "#eee", borderRadius: 8, color: "#666" }}>
                Ingen story i dag
              </div>
            </object>
            <LaegOpNu slot={slot} csrf={session.csrf} label="Læg denne op nu" />
          </figure>
        ))}
      </div>

      <h2 style={{ fontSize: 18 }}>Seneste kørsler</h2>
      {log.length === 0 && !logFejl ? (
        <p>Ingen kørsler endnu.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: 6 }}>Dato</th>
              <th style={{ padding: 6 }}>Tid</th>
              <th style={{ padding: 6 }}>Platform</th>
              <th style={{ padding: 6 }}>Story</th>
              <th style={{ padding: 6 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={`${l.dato}-${l.slot}-${l.platform}`} style={{ borderBottom: "1px solid #eee", background: l.status === "fejl" ? "#fdecea" : undefined }}>
                <td style={{ padding: 6 }}>{l.dato.split("-").reverse().join("-")}</td>
                <td style={{ padding: 6 }}>{SLOTNAVN[l.slot]}</td>
                <td style={{ padding: 6 }}>{l.platform === "facebook" ? "Facebook" : "Instagram"}</td>
                <td style={{ padding: 6 }}>{TYPENAVN[l.type] ?? l.type}</td>
                <td style={{ padding: 6 }}>
                  {STATUSNAVN[l.status] ?? l.status}
                  {l.besked ? <div style={{ color: "#7a1f14", fontSize: 12 }}>{l.besked}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
