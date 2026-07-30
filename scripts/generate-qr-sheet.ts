// Genererer et printklart QR-ark til salens 44 borde.
//
// Kør:
//   TABLE_QR_SECRET=... npm run qr:sheet
//
// Valgfrie env-variabler:
//   SITE_URL          sitets basis-URL (default https://bakkenshvile.vercel.app)
//                     — ENESTE kilde til QR-koderne, så et domæneskift kun
//                     kræver at denne variabel ændres.
//   TABLE_TOKEN_VERSION  tokenversion/sæson (default 2026)
//   QR_OUT            outputsti (default scripts/output/qr-ark.html)
//
// Resultatet er én HTML-fil med ét A4-ark pr. bord (stort bordnummer, QR-kode,
// bestillingstekst og sæson) samt en intern kontroloversigt til sidst. Åbn
// filen i en browser og print til PDF/papir.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildQrSheet, renderQrSvg } from "@/lib/qr-sheet";
import { siteUrl } from "@/lib/site-url";

const BASE_URL = siteUrl();
const OUT = process.env.QR_OUT || "scripts/output/qr-ark.html";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const entries = buildQrSheet(BASE_URL);

  // QR-koderne tegnes som SVG (skarpe ved print, ingen ekstern fil).
  const svgs = await Promise.all(
    entries.map((e) => renderQrSvg(e.url, { errorCorrectionLevel: "M", margin: 1 }))
  );

  const pages = entries
    .map((e, i) => {
      const svg = svgs[i].replace(
        "<svg",
        '<svg width="320" height="320" role="img" aria-label="QR-kode"'
      );
      return `
      <section class="page">
        <div class="table-no">${e.number}</div>
        <div class="place">${e.row}. række · ${e.position}. bord fra baren · kategori ${escapeHtml(
          e.category
        )}</div>
        <div class="qr">${svg}</div>
        <div class="cta">Scan og bestil – vi kommer med det til bordet</div>
        <div class="season">Sæson ${escapeHtml(e.version)}</div>
      </section>`;
    })
    .join("\n");

  const controlRows = entries
    .map(
      (e) =>
        `<tr><td>${e.number}</td><td>${e.row}</td><td>${e.position}</td><td>${escapeHtml(
          e.category
        )}</td><td class="url">${escapeHtml(e.url)}</td></tr>`
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8" />
<title>QR-ark · Bakkens Hvile · sæson ${escapeHtml(entries[0]?.version ?? "")}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Playfair Display", serif; color: #14261d; }
  .page {
    width: 210mm; height: 297mm; padding: 24mm 20mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; page-break-after: always; background: #fff;
  }
  .table-no { font-size: 150mm; line-height: 0.9; font-weight: 900; letter-spacing: -0.02em; }
  .place { font-size: 7mm; margin-top: 6mm; color: #4a5a50; }
  .qr { margin: 12mm 0 8mm; }
  .qr svg { width: 90mm; height: 90mm; }
  .cta { font-size: 9mm; max-width: 150mm; }
  .season { margin-top: 10mm; font-size: 4mm; color: #8a8578; letter-spacing: 0.1em; }

  .control { padding: 16mm; page-break-before: always; font-family: -apple-system, system-ui, sans-serif; }
  .control h1 { font-size: 6mm; }
  table { width: 100%; border-collapse: collapse; font-size: 3.4mm; }
  th, td { border: 0.3mm solid #ccc; padding: 1.5mm 2mm; text-align: left; }
  td.url { font-family: ui-monospace, monospace; word-break: break-all; font-size: 3mm; }
  @media screen { body { background: #eee; } .page, .control { margin: 8mm auto; box-shadow: 0 0 6px rgba(0,0,0,0.2); } }
</style>
</head>
<body>
${pages}
<div class="control">
  <h1>Intern kontroloversigt — ${entries.length} borde · sæson ${escapeHtml(
    entries[0]?.version ?? ""
  )}</h1>
  <p>Kontrollér at bordnummeret på hvert skilt matcher URL'en. Del ikke denne oversigt offentligt.</p>
  <table>
    <thead><tr><th>Bord</th><th>Række</th><th>Plads</th><th>Kategori</th><th>URL</th></tr></thead>
    <tbody>
${controlRows}
    </tbody>
  </table>
</div>
</body>
</html>`;

  const outPath = resolve(process.cwd(), OUT);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf8");
  console.log(`Skrev ${entries.length} QR-ark til ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
