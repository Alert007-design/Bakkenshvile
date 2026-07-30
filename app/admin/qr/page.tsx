import { buildQrSheet, renderQrSvg, type QrSheetEntry } from "@/lib/qr-sheet";
import { siteUrl } from "@/lib/site-url";
import "./qr.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Skjult, må ikke indekseres eller caches (tokens i URL'erne).
export const metadata = { robots: { index: false, follow: false } };
export const fetchCache = "force-no-store";

const CARDS_PER_SHEET = 6;

function AccessMessage() {
  return (
    <div style={{ padding: 48, fontFamily: "sans-serif" }}>
      <h1>QR-ark — adgang</h1>
      <p>
        Tilføj din nøgle i URL&apos;en, fx <code>/admin/qr?key=DIN-NOEGLE</code>. Nøglen
        er den samme <code>ADMIN_KEY</code> som til bordplanen.
      </p>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function AdminQrPage({
  searchParams,
}: {
  searchParams: { key?: string; raekke?: string; bord?: string };
}) {
  // Genbrug den eksisterende admin-beskyttelse (?key=ADMIN_KEY).
  const key = searchParams.key || "";
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return <AccessMessage />;
  }

  // QR-koderne peger på sitets kanoniske URL (SITE_URL), uanset hvor admin ses.
  const baseUrl = siteUrl();

  let entries: QrSheetEntry[];
  try {
    entries = buildQrSheet(baseUrl);
  } catch {
    // Typisk manglende TABLE_QR_SECRET.
    return (
      <div className="qr-empty">
        <h1>QR-ark</h1>
        <p>
          Miljøvariablen <code>TABLE_QR_SECRET</code> mangler. Sæt den i Vercel, før
          arket kan genereres.
        </p>
      </div>
    );
  }

  // Filtre til genprint af et enkelt skilt uden at printe alle sider.
  let filterLabel = "Alle 44 borde";
  if (searchParams.bord) {
    const n = Number(searchParams.bord);
    entries = entries.filter((e) => e.number === n);
    filterLabel = `Kun bord ${n}`;
  } else if (searchParams.raekke) {
    const r = Number(searchParams.raekke);
    entries = entries.filter((e) => e.row === r);
    filterLabel = `Kun række ${r}`;
  }

  if (entries.length === 0) {
    return (
      <div className="qr-empty">
        <h1>QR-ark</h1>
        <p>Ingen borde matcher filteret. Prøv fx <code>?raekke=9</code> eller <code>?bord=94</code>.</p>
      </div>
    );
  }

  // Render alle QR-koder serverside som inline SVG (fejlkorrektion Q, quiet
  // zone 4). Hemmeligheden forlader aldrig serveren.
  const svgs = await Promise.all(
    entries.map((e) => renderQrSvg(e.url, { errorCorrectionLevel: "Q", margin: 4 }))
  );
  const sheets = chunk(
    entries.map((e, i) => ({ entry: e, svg: svgs[i] })),
    CARDS_PER_SHEET
  );
  const version = entries[0]?.version ?? "";

  return (
    <div className="qr-admin">
      <div className="qr-toolbar no-print">
        <strong>QR-ark</strong>
        <span>{filterLabel} · {entries.length} kort · sæson {version}</span>
        <span className="hint">Tryk ⌘P / Ctrl+P for at printe (A4 stående, margener: ingen).</span>
        <span>
          Genprint: <a href={`/admin/qr?key=${encodeURIComponent(key)}&raekke=9`}>?raekke=9</a>{" "}
          · <a href={`/admin/qr?key=${encodeURIComponent(key)}&bord=94`}>?bord=94</a>{" "}
          · <a href={`/admin/qr?key=${encodeURIComponent(key)}`}>alle</a>
        </span>
      </div>

      {sheets.map((sheet, si) => (
        <div className="qr-sheet" key={si}>
          {sheet.map(({ entry, svg }) => (
            <div className="qr-card" key={entry.number}>
              <div className="no">{entry.number}</div>
              <div className="place">
                {entry.row}. række · {entry.position}. bord fra baren
              </div>
              <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="cta">Scan og bestil fra bordet</div>
              <div className="season">Sæson {entry.version}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
