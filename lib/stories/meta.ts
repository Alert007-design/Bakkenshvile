// Det eneste sted, der taler med Metas Graph API for stories. Prøver aldrig
// igen af sig selv: et kald, hvis svar vi ikke fik, kan godt være gået
// igennem. Nøglen sendes i kroppen eller en header og står aldrig i en
// fejlbesked eller i loggen. Samme opbygning som den, der kører stabilt på
// mrmesserschmidt.dk.

const VERSION = "v25.0";
const TIMEOUT = 20_000;
const RETTIGHED = new Set([10, 200, 283]);
const GRAENSE = new Set([4, 17, 32, 613]);
// Instagram tegner billedet først, når den henter det, og kan kræve mange
// sekunder. Pauserne vokser, og de er i alt 35 sekunder (8 statustjek), så
// kørslen sammen med Facebook og billedet bliver under de 60 sekunder, ruten må
// køre. Er beholderen stadig ikke færdig, gemmes den som "venter" og udgives
// ved næste timekørsel.
const IG_PAUSER = [2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000];

export type FejlArt =
  | "noegle_doed"
  | "rettighed"
  | "graense"
  | "blokeret"
  | "uvist"
  | "afvist"
  | "opsaetning";

export class MetaFejl extends Error {
  art: FejlArt;
  kode?: number;
  /** Instagram-beholderen, hvis den var oprettet, da fejlen opstod. Gemmes i loggen, så den ikke udgives to gange. */
  creationId?: string;
  constructor(besked: string, art: FejlArt, kode?: number) {
    super(besked);
    this.name = "MetaFejl";
    this.art = art;
    this.kode = kode;
  }
}

function art(status: number, kode?: number): FejlArt {
  if (kode === 190) return "noegle_doed";
  if (kode !== undefined && RETTIGHED.has(kode)) return "rettighed";
  if (kode !== undefined && GRAENSE.has(kode)) return "graense";
  if (kode === 368) return "blokeret";
  if (status >= 500 || kode === 1 || kode === 2) return "uvist";
  return "afvist";
}

/**
 * Udfaldet for en Instagram-beholder:
 *  - id: udgivet nu
 *  - venter: beholderen er endnu ikke færdig (eller svaret gik tabt); tjek igen senere
 *  - alleredeLagt: Instagram siger, at beholderen allerede er udgivet (udgives aldrig igen)
 */
export type InstagramUdfald = { id: string } | { venter: string } | { alleredeLagt: string };

export interface Meta {
  facebookStory(sideId: string, noegle: string, billede: string): Promise<{ id: string }>;
  /** Opretter beholderen, venter op til ca. 35 sekunder og udgiver, hvis den er færdig. */
  instagramStory(kontoId: string, noegle: string, billede: string): Promise<InstagramUdfald>;
  /**
   * Tjekker en beholder, der allerede findes (ét tjek, ingen ventetid), og
   * udgiver den kun, hvis den er FINISHED. ERROR/EXPIRED svares som `ugyldig`.
   */
  instagramUdgiv(
    kontoId: string,
    noegle: string,
    creationId: string
  ): Promise<InstagramUdfald | { ugyldig: string }>;
}

type Hent = (url: string, init?: RequestInit) => Promise<Response>;

export function opretMeta({
  fetch: hent = fetch as Hent,
  version = VERSION,
  vent = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
}: { fetch?: Hent; version?: string; vent?: (ms: number) => Promise<void> } = {}): Meta {
  const rens = (s: unknown, noegle: string) =>
    String(s ?? "").split(noegle).join("***").slice(0, 300);

  async function laesSvar(svar: Response, noegle: string) {
    let data: Record<string, unknown> = {};
    try {
      data = (await svar.json()) ?? {};
    } catch {
      data = {};
    }
    const fejl = data.error as { code?: number; message?: string } | undefined;
    if (!svar.ok || fejl) {
      throw new MetaFejl(
        `Meta svarede ${svar.status}: ${rens(fejl?.message, noegle)}`,
        art(svar.status, fejl?.code),
        fejl?.code
      );
    }
    return data;
  }

  async function get(sti: string, noegle: string) {
    let svar: Response;
    try {
      svar = await hent(`https://graph.facebook.com/${version}/${sti}`, {
        headers: { Authorization: `Bearer ${noegle}` },
      });
    } catch {
      throw new MetaFejl("Intet svar fra Meta", "uvist");
    }
    return laesSvar(svar, noegle);
  }

  async function post(sti: string, noegle: string, felter: Record<string, string>) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    let svar: Response;
    try {
      svar = await hent(`https://graph.facebook.com/${version}/${sti}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...felter, access_token: noegle }).toString(),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new MetaFejl(`Intet svar fra Meta: ${rens((e as Error)?.message, noegle)}`, "uvist");
    } finally {
      clearTimeout(t);
    }
    return laesSvar(svar, noegle);
  }

  function tjek(id: string, noegle: string) {
    if (!id || !noegle) {
      throw new MetaFejl("Side-id eller nøgle mangler i Vercel", "opsaetning");
    }
  }

  function medBeholder(e: MetaFejl, creationId: string): MetaFejl {
    e.creationId = creationId;
    return e;
  }

  // Et netværksbrud, en Meta-fejl uden svar eller en grænse for antal kald
  // betyder ikke, at beholderen er ødelagt: den tjekkes igen senere.
  const midlertidig = (e: unknown) => e instanceof MetaFejl && (e.art === "uvist" || e.art === "graense");

  /**
   * Fælles for en ny og en gammel beholder: tjek status (med pauser mellem
   * tjekkene), og udgiv kun, når Instagram siger FINISHED. En beholder, der
   * allerede er PUBLISHED, udgives aldrig igen. Mistes svaret på selve
   * udgivelsen, svares "venter": næste tjek viser så PUBLISHED, hvis den gik
   * igennem, og ellers udgives den da.
   */
  async function faerdiggoer(
    kontoId: string,
    noegle: string,
    creationId: string,
    pauser: number[]
  ): Promise<InstagramUdfald | { ugyldig: string }> {
    let kode = "";
    for (let n = 0; n <= pauser.length; n++) {
      try {
        const s = await get(`${creationId}?fields=status_code`, noegle);
        kode = String(s.status_code ?? "");
      } catch (e) {
        if (midlertidig(e)) return { venter: creationId };
        throw e instanceof MetaFejl ? medBeholder(e, creationId) : e;
      }
      if (kode === "PUBLISHED") return { alleredeLagt: creationId };
      if (kode === "ERROR" || kode === "EXPIRED") return { ugyldig: kode };
      if (kode === "FINISHED") break;
      if (n < pauser.length) await vent(pauser[n]);
    }
    if (kode !== "FINISHED") return { venter: creationId };
    try {
      const d = await post(`${kontoId}/media_publish`, noegle, { creation_id: creationId });
      if (!d.id) return { venter: creationId };
      return { id: String(d.id) };
    } catch (e) {
      if (midlertidig(e)) return { venter: creationId };
      throw e instanceof MetaFejl ? medBeholder(e, creationId) : e;
    }
  }

  return {
    // Facebook-story i to trin: billedet lægges op uden at blive udgivet og
    // bliver derefter til en story. Meta henter selv billedet fra adressen.
    async facebookStory(sideId, noegle, billede) {
      tjek(sideId, noegle);
      const foto = await post(`${sideId}/photos`, noegle, { url: billede, published: "false" });
      if (!foto.id) throw new MetaFejl("Meta svarede uden id på billedet", "uvist");
      const d = await post(`${sideId}/photo_stories`, noegle, { photo_id: String(foto.id) });
      const id = d.post_id || d.id;
      if (!id) throw new MetaFejl("Meta svarede uden id på storyen", "uvist");
      return { id: String(id) };
    },

    // Instagram-story: beholder med billedet (kun JPEG), vent til Meta har
    // hentet det, og udgiv. Er beholderen ikke færdig i tide, er det ikke en
    // fejl: den gemmes som "venter" og udgives næste time.
    async instagramStory(kontoId, noegle, billede) {
      tjek(kontoId, noegle);
      const b = await post(`${kontoId}/media`, noegle, { image_url: billede, media_type: "STORIES" });
      if (!b.id) throw new MetaFejl("Instagram svarede uden id på billedet", "uvist");
      const creationId = String(b.id);
      const u = await faerdiggoer(kontoId, noegle, creationId, IG_PAUSER);
      if ("ugyldig" in u) {
        throw medBeholder(new MetaFejl(`Instagram kunne ikke bruge billedet (${u.ugyldig})`, "afvist"), creationId);
      }
      return u;
    },

    async instagramUdgiv(kontoId, noegle, creationId) {
      tjek(kontoId, noegle);
      return faerdiggoer(kontoId, noegle, creationId, []);
    },
  };
}
