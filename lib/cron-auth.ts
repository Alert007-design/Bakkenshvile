// Fælles adgangskontrol for de planlagte job (Vercel cron). Vercel sender
// CRON_SECRET som "Authorization: Bearer ..." – men kun hvis variablen findes
// i projektet. Mangler den, afvises hvert kald i stilhed, og jobbet kører
// aldrig. Det skete for stories 15.–16. november 2026. Derfor skrives der nu
// en tydelig fejl i loggen, og /admin/stories viser en rød advarsel.

export type CronAdgang = "ok" | "mangler-hemmelighed" | "forkert-noegle";

export function tjekCronAdgang(
  authorization: string | null,
  env: Record<string, string | undefined>
): CronAdgang {
  const secret = String(env.CRON_SECRET ?? "").trim();
  if (!secret) return "mangler-hemmelighed";
  return authorization === `Bearer ${secret}` ? "ok" : "forkert-noegle";
}

/** True, hvis de planlagte job overhovedet kan køre. Bruges på adminsider. */
export function cronKanKoere(env: Record<string, string | undefined>): boolean {
  return String(env.CRON_SECRET ?? "").trim() !== "";
}

export const CRON_MANGLER_BESKED =
  "CRON_SECRET mangler i Vercel. Planlagte job (stories og varselsmail) kan ikke køre.";
