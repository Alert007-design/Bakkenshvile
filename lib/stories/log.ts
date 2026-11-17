// Tabellen story_log (migrations/009_story_log.sql): hvad er lagt op, og
// hvad fejlede. Rækken reserveres FØR kaldet til Meta, så to samtidige
// kørsler aldrig begge lægger den samme story op.

import type { Queryable } from "@/lib/db";
import type { Slot } from "./plan";

export type Platform = "facebook" | "instagram";
export type LogStatus = "i_gang" | "lagt" | "fejl" | "kladde" | "venter";

export interface LogLinje {
  dato: string;
  slot: Slot;
  platform: Platform;
  type: string;
  status: LogStatus;
  meta_id: string | null;
  besked: string | null;
  opdateret: string;
}

/**
 * true = rækken er vores, og vi må fortsætte. false = den findes allerede.
 * En række med status 'kladde' er aldrig lagt op og må derfor overtages af
 * en senere kørsel (fx når en skabelon godkendes samme dag). Rækker med
 * 'i_gang', 'lagt' eller 'fejl' røres aldrig.
 */
export async function reserver(
  db: Queryable,
  dato: string,
  slot: Slot,
  platform: Platform,
  type: string
): Promise<boolean> {
  const r = await db.query(
    `INSERT INTO story_log (dato, slot, platform, type, status)
     VALUES ($1, $2, $3, $4, 'i_gang')
     ON CONFLICT (dato, slot, platform) DO UPDATE
       SET status = 'i_gang', type = EXCLUDED.type, meta_id = NULL, besked = NULL, opdateret = now()
       WHERE story_log.status = 'kladde'
     RETURNING dato`,
    [dato, slot, platform, type]
  );
  return r.rows.length === 1;
}

/**
 * Overtager en række med netop den status, der angives ('venter' eller 'fejl'),
 * og sætter den til 'i_gang'. Det er ét atomart skridt: kun ÉN af flere
 * samtidige kørsler (cron og manuel kørsel) får rækken, og den, der får den,
 * er den eneste, der må udgive. En række, der er 'lagt', 'i_gang' eller
 * 'kladde', kan aldrig overtages. Svaret er beholder-id'et (meta_id), eller
 * null, hvis rækken ikke blev overtaget.
 */
export async function overtag(
  db: Queryable,
  dato: string,
  slot: Slot,
  platform: Platform,
  fraStatus: "venter" | "fejl"
): Promise<{ metaId: string | null } | null> {
  const r = await db.query<{ meta_id: string | null }>(
    `UPDATE story_log SET status = 'i_gang', besked = NULL, opdateret = now()
     WHERE dato = $1 AND slot = $2 AND platform = $3 AND status = $4
     RETURNING meta_id`,
    [dato, slot, platform, fraStatus]
  );
  return r.rows.length === 1 ? { metaId: r.rows[0].meta_id } : null;
}

/** Dagens Instagram-rækker, der venter på, at billedet bliver færdigt. */
export async function hentVentende(
  db: Queryable,
  dato: string
): Promise<{ slot: Slot; type: string }[]> {
  const r = await db.query<{ slot: Slot; type: string }>(
    `SELECT slot, type FROM story_log
     WHERE dato = $1 AND platform = 'instagram' AND status = 'venter'
     ORDER BY slot ASC`,
    [dato]
  );
  return r.rows.map((x) => ({ slot: x.slot, type: x.type }));
}

export async function afslut(
  db: Queryable,
  dato: string,
  slot: Slot,
  platform: Platform,
  status: Exclude<LogStatus, "i_gang">,
  metaId: string | null,
  besked: string | null
): Promise<void> {
  await db.query(
    `UPDATE story_log SET status = $4, meta_id = $5, besked = $6, opdateret = now()
     WHERE dato = $1 AND slot = $2 AND platform = $3`,
    [dato, slot, platform, status, metaId, besked ? besked.slice(0, 500) : null]
  );
}

export async function hentLog(db: Queryable, antal = 40): Promise<LogLinje[]> {
  const r = await db.query<LogLinje & { dato: string | Date; opdateret: string | Date }>(
    `SELECT to_char(dato, 'YYYY-MM-DD') AS dato, slot, platform, type, status,
            meta_id, besked, opdateret
     FROM story_log
     ORDER BY dato DESC, slot DESC, platform ASC
     LIMIT $1`,
    [antal]
  );
  return r.rows.map((l) => ({
    ...l,
    dato: String(l.dato),
    opdateret: new Date(l.opdateret as string).toISOString(),
  }));
}
