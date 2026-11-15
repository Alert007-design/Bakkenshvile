// Story-billeder i 1080×1920 (JPEG, som Instagram kræver). Tegnes med satori
// (bokse til SVG) og resvg (SVG til pixels), derefter JPEG med jpeg-js.
// Samme farver og skrifter som hjemmesiden: Playfair Display og Work Sans,
// mørkeblå baggrund og guld.
//
// Fotos og skrifter ligger i lib/stories/fotos og lib/stories/fonte og tages
// med i funktionen via outputFileTracingIncludes i next.config.js.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoryIndhold } from "./plan";

const B = 1080;
const H = 1920;
const BLAA = "#141B36";
const GULD = "#D8B45C";
const PAPIR = "#F2EEE7";

const MAPPE = join(process.cwd(), "lib", "stories");

type Skrift = { name: string; data: Buffer; weight: 500 | 600 | 700; style: "normal" | "italic" };
let skrifter: Skrift[] | null = null;
function fonte(): Skrift[] {
  if (skrifter) return skrifter;
  const fil = (f: string) => readFileSync(join(MAPPE, "fonte", f));
  skrifter = [
    { name: "Playfair", data: fil("playfair-display-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Playfair", data: fil("playfair-display-latin-600-italic.woff"), weight: 600, style: "italic" },
    { name: "Work Sans", data: fil("work-sans-latin-500-normal.woff"), weight: 500, style: "normal" },
    { name: "Work Sans", data: fil("work-sans-latin-600-normal.woff"), weight: 600, style: "normal" },
  ];
  return skrifter;
}

function foto(fil: string): string | null {
  if (!/^[a-z0-9-]+\.jpg$/.test(fil)) return null;
  try {
    return `data:image/jpeg;base64,${readFileSync(join(MAPPE, "fotos", fil)).toString("base64")}`;
  } catch {
    return null;
  }
}

type Node = { type: string; props: Record<string, unknown> };
function e(style: Record<string, unknown>, ...boern: (Node | string | null | false)[]): Node {
  const children = boern.filter((x) => x !== null && x !== false);
  return {
    type: "div",
    props: { style: { display: "flex", ...style }, children: children.length === 1 ? children[0] : children },
  };
}

/** Skriftstørrelse til hovedlinjerne, så den længste linje kan være der. */
export function hovedStoerrelse(linjer: string[]): number {
  const laengst = Math.max(...linjer.map((l) => l.length));
  if (laengst <= 9) return 150;
  if (laengst <= 13) return 124;
  if (laengst <= 18) return 98;
  return 84;
}

/**
 * Hvor i fotoet der skæres til, når det ikke passer til feltet (CSS
 * object-position). Høje portrætfotos skæres fra toppen, så ansigterne
 * kommer med. Justeres pr. foto efter et visuelt tjek.
 */
export const UDSNIT: Record<string, string> = {
  "tre-piger.jpg": "50% 8%",
};
const STANDARD_UDSNIT = "50% 20%";

export function layout(s: StoryIndhold): Node {
  const billede = foto(s.foto);
  const str = hovedStoerrelse(s.hoved);
  return e(
    { width: B, height: H, background: BLAA, position: "relative", fontFamily: "Work Sans", color: PAPIR },
    billede
      ? { type: "img", props: { src: billede, style: { position: "absolute", left: 0, top: 0, width: B, height: 1280, objectFit: "cover", objectPosition: UDSNIT[s.foto] ?? STANDARD_UDSNIT } } }
      : null,
    e({
      position: "absolute", left: 0, top: 0, width: B, height: 1280,
      backgroundImage: "linear-gradient(to bottom, rgba(20,27,54,0.55) 0%, rgba(20,27,54,0) 18%, rgba(20,27,54,0) 52%, rgba(20,27,54,1) 100%)",
    }),
    e(
      { position: "absolute", left: 0, top: 0, width: B, height: H, flexDirection: "column", alignItems: "center" },
      e({ marginTop: 170, fontFamily: "Playfair", fontWeight: 700, fontSize: 44, letterSpacing: 6 }, "BAKKENS HVILE"),
      e({ flexGrow: 1 }),
      e({ fontSize: 34, fontWeight: 600, letterSpacing: 8, color: GULD }, s.overlinje),
      e(
        { flexDirection: "column", alignItems: "center", marginTop: 18 },
        ...s.hoved.map((l) =>
          e({ fontFamily: "Playfair", fontWeight: 700, fontSize: str, lineHeight: 1.04, textAlign: "center" }, l)
        )
      ),
      e(
        { fontFamily: "Playfair", fontStyle: "italic", fontWeight: 600, fontSize: 54, marginTop: 26, textAlign: "center", maxWidth: 940 },
        s.underlinje
      ),
      e(
        {
          marginTop: 70, marginBottom: 230, background: GULD, color: BLAA, fontSize: 50, fontWeight: 600,
          paddingLeft: 54, paddingRight: 54, paddingTop: 14, paddingBottom: 18, borderRadius: 999,
        },
        s.bund
      )
    )
  );
}

/** Tegner storyen som JPEG. */
export async function tegnStory(s: StoryIndhold): Promise<Buffer> {
  const satori = (await import("satori")).default;
  const { Resvg } = await import("@resvg/resvg-js");
  const jpeg = await import("jpeg-js");
  const svg = await satori(layout(s) as never, { width: B, height: H, fonts: fonte() });
  const r = new Resvg(svg, { fitTo: { mode: "width", value: B } }).render();
  return Buffer.from(
    jpeg.encode({ data: Buffer.from(r.pixels), width: r.width, height: r.height }, 88).data
  );
}
