// Det eneste sted, der taler med Metas Graph API for stories. Prøver aldrig
// igen af sig selv: et kald, hvis svar vi ikke fik, kan godt være gået
// igennem. Nøglen sendes i kroppen eller en header og står aldrig i en
// fejlbesked eller i loggen. Samme opbygning som den, der kører stabilt på
// mrmesserschmidt.dk.

const VERSION = "v25.0";
const TIMEOUT = 20_000;
const RETTIGHED = new Set([10, 200, 283]);
const GRAENSE = new Set([4, 17, 32, 613]);
const IG_FORSOEG = 10;
const IG_PAUSE = 3_000;

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

export interface Meta {
  facebookStory(sideId: string, noegle: string, billede: string): Promise<{ id: string }>;
  instagramStory(kontoId: string, noegle: string, billede: string): Promise<{ id: string }>;
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
    // hentet det, og udgiv.
    async instagramStory(kontoId, noegle, billede) {
      tjek(kontoId, noegle);
      const b = await post(`${kontoId}/media`, noegle, { image_url: billede, media_type: "STORIES" });
      if (!b.id) throw new MetaFejl("Instagram svarede uden id på billedet", "uvist");
      let klar = false;
      for (let n = 0; n < IG_FORSOEG && !klar; n++) {
        const s = await get(`${b.id}?fields=status_code`, noegle);
        if (s.status_code === "FINISHED") klar = true;
        else if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
          throw new MetaFejl(`Instagram kunne ikke bruge billedet (${s.status_code})`, "afvist");
        } else await vent(IG_PAUSE);
      }
      if (!klar) throw new MetaFejl("Instagram blev ikke færdig med billedet i tide", "uvist");
      const d = await post(`${kontoId}/media_publish`, noegle, { creation_id: String(b.id) });
      if (!d.id) throw new MetaFejl("Instagram svarede uden id på storyen", "uvist");
      return { id: String(d.id) };
    },
  };
}
