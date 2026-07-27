// Tynd abstraktion over transaktionsdatabasen. Applikationskoden taler kun med
// dette lag, så order-/hall-state-logikken kan testes mod en indlejret Postgres
// (pglite) uden at ændre produktionsstien.
//
// I produktion bruges Vercel Postgres (@vercel/postgres), der læser
// POSTGRES_URL fra miljøet. Poolen oprettes dovent ved første kald.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Queryable {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

let pool: Queryable | null = null;

/** Produktions-poolen (Vercel Postgres). Kaster hvis POSTGRES_URL mangler. */
export function getDb(): Queryable {
  if (pool) return pool;
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL mangler i miljøvariablerne");
  }
  // Dovent require, så tests der injicerer deres egen Queryable aldrig rører
  // @vercel/postgres (som kræver en rigtig forbindelse).
  const { createPool } = require("@vercel/postgres") as typeof import("@vercel/postgres");
  const vercelPool = createPool();
  const q: Queryable = {
    query: ((text: string, params?: unknown[]) =>
      vercelPool.query(text, params as never[])) as Queryable["query"],
  };
  pool = q;
  return q;
}

/** Kører alle .sql-filer i migrations/ i navnerækkefølge mod en Queryable. */
export async function applyMigrations(db: Queryable, dir = "migrations"): Promise<string[]> {
  const abs = join(process.cwd(), dir);
  const files = (await readdir(abs)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(abs, file), "utf8");
    await runSqlScript(db, sql);
  }
  return files;
}

/**
 * Kører et SQL-script sætning for sætning. Migrationerne indeholder kun simple
 * DDL-sætninger uden semikolon i kroppen, så en split på ";" er sikker og
 * virker både mod pglite og @vercel/postgres.
 */
export async function runSqlScript(db: Queryable, sql: string): Promise<void> {
  // Fjern hele kommentarlinjer først, så en efterfølgende split på ";" ikke
  // efterlader en sætning der starter med "--".
  const withoutComments = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.query(stmt);
  }
}

/** Kun til test: nulstiller den cachede pool. */
export function __resetDbForTests() {
  pool = null;
}
