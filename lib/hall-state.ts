// Salens tilstand pr. forestilling (event). Baren bekræfter aftenens event og
// styrer tilstanden. Bestilling er kun mulig når ordering_open er true.

import type { Queryable } from "@/lib/db";

export type HallStateValue = "before_show" | "show" | "interval" | "closed";

export interface HallState {
  eventId: string;
  state: HallStateValue;
  orderingOpen: boolean;
  updatedAt: string;
}

function toHallState(row: {
  event_id: string;
  state: HallStateValue;
  ordering_open: boolean;
  updated_at: string;
}): HallState {
  return {
    eventId: row.event_id,
    state: row.state,
    orderingOpen: row.ordering_open,
    updatedAt: String(row.updated_at),
  };
}

/** Salens tilstand for et event. Null hvis den aldrig er sat (⇒ lukket). */
export async function getHallState(
  db: Queryable,
  eventId: string
): Promise<HallState | null> {
  const { rows } = await db.query<{
    event_id: string;
    state: HallStateValue;
    ordering_open: boolean;
    updated_at: string;
  }>(
    `SELECT event_id, state, ordering_open, updated_at FROM hall_state WHERE event_id = $1`,
    [eventId]
  );
  return rows[0] ? toHallState(rows[0]) : null;
}

/**
 * Sætter (opretter/opdaterer) salens tilstand for et event. Upsert på
 * event_id, så der altid er præcis én tilstand pr. forestilling.
 */
export async function setHallState(
  db: Queryable,
  eventId: string,
  state: HallStateValue,
  orderingOpen: boolean
): Promise<HallState> {
  const { rows } = await db.query<{
    event_id: string;
    state: HallStateValue;
    ordering_open: boolean;
    updated_at: string;
  }>(
    `INSERT INTO hall_state (event_id, state, ordering_open, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (event_id)
     DO UPDATE SET state = EXCLUDED.state,
                   ordering_open = EXCLUDED.ordering_open,
                   updated_at = now()
     RETURNING event_id, state, ordering_open, updated_at`,
    [eventId, state, orderingOpen]
  );
  return toHallState(rows[0]);
}

/**
 * Er bestilling åben for et event? Serverside-værn: uden en aktiv, åben
 * tilstand afvises bestilling (et fotograferet QR-skilt virker ikke hjemmefra).
 */
export async function isOrderingOpen(db: Queryable, eventId: string): Promise<boolean> {
  const hs = await getHallState(db, eventId);
  return Boolean(hs?.orderingOpen);
}

/**
 * Aftenens aktive forestilling: den ene med åben bestilling. Gæsten scanner et
 * bord uden at kende eventet, så serveren udleder det herfra. Null hvis ingen
 * forestilling er åben (⇒ bestilling lukket).
 */
export async function getActiveEvent(db: Queryable): Promise<HallState | null> {
  const { rows } = await db.query<{
    event_id: string;
    state: HallStateValue;
    ordering_open: boolean;
    updated_at: string;
  }>(
    `SELECT event_id, state, ordering_open, updated_at
       FROM hall_state WHERE ordering_open = true
      ORDER BY updated_at DESC LIMIT 1`
  );
  return rows[0] ? toHallState(rows[0]) : null;
}

/**
 * Baren bekræfter aftenens forestilling: åbner bestilling for dette event og
 * lukker alle andre, så der altid er præcis ét aktivt event. Der kan kun
 * bestilles til den konkrete aften.
 */
export async function activateEvent(
  db: Queryable,
  eventId: string,
  state: HallStateValue = "before_show"
): Promise<HallState> {
  await db.query("BEGIN");
  try {
    await db.query(
      `UPDATE hall_state SET ordering_open = false, updated_at = now()
        WHERE event_id <> $1 AND ordering_open = true`,
      [eventId]
    );
    const hs = await setHallState(db, eventId, state, true);
    await db.query("COMMIT");
    return hs;
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}
