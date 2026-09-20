// Pladsbogen: reservationer, salg og frigivelse af billetter pr. forestilling
// og priskategori. Al samtidighedssikring ligger her.
//
// HVORDOR DET ER SIKKERT VED SAMTIDIGE KØB
//
// seat_counters har ÉN række pr. forestilling med fire tal. En reservation er
// derfor én enkelt UPDATE med fire betingelser:
//
//   UPDATE ... SET a = a + 2, b = b + 1
//    WHERE show_id = ... AND a + 2 <= loft_a AND b + 1 <= loft_b
//
// Postgres låser rækken, mens den opdateres. En samtidig køber blokerer, og
// når den slipper igennem, prøves betingelserne mod de NYE tal (Postgres'
// egen genlæsning i READ COMMITTED). Enten passer alle fire betingelser, og
// alle fire tal opdateres — eller også sker der ingenting. Det er både værnet
// mod at to kunder får den sidste plads OG garantien for, at en bestilling på
// tværs af kategorier er alt-eller-intet.
//
// seat_holds er bogføringen: én linje pr. bestilling pr. kategori. Den unikke
// indeks på (booking_id, category) er værnet mod dobbelttælling på tværs af
// købsflow, fribilletter og importen af gamle bookinger.
//
// Alle funktioner tager en Queryable, så de kan testes mod en indlejret
// Postgres (pglite) uden at ændre produktionsstien.

import type { Queryable } from "@/lib/db";
import {
  KAPACITETSKATEGORIER,
  type Kapacitetskategori,
} from "@/lib/kapacitet";

/** Hvor en linje i pladsbogen kommer fra. */
export type HoldKilde = "checkout" | "fribillet" | "import";

/** Linjens tilstand: reserveret, endeligt solgt eller givet tilbage. */
export type HoldStatus = "held" | "sold" | "released";

/** Et ønske om et antal pladser i én kategori. */
export interface Pladsoenske {
  kategori: Kapacitetskategori;
  antal: number;
  /** Billettypens Airtable-id. Gemmes, så teksten aldrig skal tolkes senere. */
  ticketTypeId?: string | null;
}

export type Pladstal = Record<Kapacitetskategori, number>;

/** Kategoriens kolonne i seat_counters. Fast tabel — aldrig brugerinput. */
const KOLONNE: Record<Kapacitetskategori, string> = {
  aplusForrest: "taken_aplus_front",
  aplusBagerst: "taken_aplus_back",
  a: "taken_a",
  b: "taken_b",
};

const NUL: Pladstal = { aplusForrest: 0, aplusBagerst: 0, a: 0, b: 0 };

interface TaelleRaekke {
  taken_aplus_front: number | string;
  taken_aplus_back: number | string;
  taken_a: number | string;
  taken_b: number | string;
}

function tilPladstal(r: TaelleRaekke): Pladstal {
  return {
    aplusForrest: Number(r.taken_aplus_front),
    aplusBagerst: Number(r.taken_aplus_back),
    a: Number(r.taken_a),
    b: Number(r.taken_b),
  };
}

/** Lægger ønskerne sammen pr. kategori. Ugyldige antal ignoreres. */
function summerOensker(oensker: Pladsoenske[]): Pladstal {
  const ud: Pladstal = { ...NUL };
  for (const o of oensker) {
    if (!KAPACITETSKATEGORIER.includes(o.kategori)) continue;
    if (!Number.isInteger(o.antal) || o.antal <= 0) continue;
    ud[o.kategori] += o.antal;
  }
  return ud;
}

/** Sikrer, at forestillingen har en linje i pladsbogen. Kan køres frit igen. */
async function sikrTaellelinje(db: Queryable, showId: string): Promise<void> {
  await db.query(
    `INSERT INTO seat_counters (show_id) VALUES ($1)
     ON CONFLICT (show_id) DO NOTHING`,
    [showId]
  );
}

/** De fire "hvor mange er taget"-tal for en forestilling. */
export async function hentTagne(db: Queryable, showId: string): Promise<Pladstal> {
  const kort = await hentTagneForShows(db, [showId]);
  return kort.get(showId) ?? { ...NUL };
}

/**
 * Som hentTagne, men for mange forestillinger i ÉT kald. Adminoversigten viser
 * alle kommende forestillinger, og ét opslag pr. forestilling ville gøre siden
 * unødigt langsom. Forestillinger uden salg får nuller.
 */
export async function hentTagneForShows(
  db: Queryable,
  showIds: string[]
): Promise<Map<string, Pladstal>> {
  const ud = new Map<string, Pladstal>();
  if (showIds.length === 0) return ud;
  const { rows } = await db.query<TaelleRaekke & { show_id: string }>(
    `SELECT show_id, taken_aplus_front, taken_aplus_back, taken_a, taken_b
       FROM seat_counters WHERE show_id = ANY($1)`,
    [showIds]
  );
  for (const r of rows) ud.set(r.show_id, tilPladstal(r));
  // Forestillinger, der aldrig har solgt noget, har ingen linje endnu.
  for (const id of showIds) if (!ud.has(id)) ud.set(id, { ...NUL });
  return ud;
}

/**
 * Tæller pladsbogens linjer sammen forfra. Bruges af adminoversigten til at
 * vise, om de fire tal og de enkelte linjer er enige — så en eventuel
 * uoverensstemmelse er synlig i stedet for skjult.
 */
export async function genberegnTagne(
  db: Queryable,
  showId: string
): Promise<Pladstal> {
  const kort = await genberegnTagneForShows(db, [showId]);
  return kort.get(showId) ?? { ...NUL };
}

/** Som genberegnTagne, men for mange forestillinger i ÉT kald. */
export async function genberegnTagneForShows(
  db: Queryable,
  showIds: string[]
): Promise<Map<string, Pladstal>> {
  const ud = new Map<string, Pladstal>();
  if (showIds.length === 0) return ud;
  for (const id of showIds) ud.set(id, { ...NUL });
  const { rows } = await db.query<{
    show_id: string;
    category: string;
    antal: string | number;
  }>(
    `SELECT show_id, category, SUM(quantity) AS antal
       FROM seat_holds
      WHERE show_id = ANY($1) AND status IN ('held','sold')
      GROUP BY show_id, category`,
    [showIds]
  );
  for (const r of rows) {
    const k = r.category as Kapacitetskategori;
    const tal = ud.get(r.show_id);
    if (tal && KAPACITETSKATEGORIER.includes(k)) tal[k] = Number(r.antal);
  }
  return ud;
}

/**
 * Frigiver reservationer, hvis tid er løbet ud, og giver pladserne tilbage.
 *
 * Kører som ét SQL-greb, så linjerne og de fire tal aldrig kan nå at være
 * uenige. Kaldes dovent — før hvert opslag af ledige pladser og før hver ny
 * reservation — så der ikke skal oprettes et cron-job til det.
 */
export async function frigivUdloebne(db: Queryable, showId: string): Promise<void> {
  await frigivUdloebneForShows(db, [showId]);
}

/** Som frigivUdloebne, men for mange forestillinger i ÉT greb. */
export async function frigivUdloebneForShows(
  db: Queryable,
  showIds: string[]
): Promise<void> {
  if (showIds.length === 0) return;
  await db.query(
    `WITH udloebne AS (
       UPDATE seat_holds
          SET status = 'released'
        WHERE show_id = ANY($1)
          AND status = 'held'
          AND expires_at IS NOT NULL
          AND expires_at <= now()
        RETURNING show_id, category, quantity
     ), frigivet AS (
       SELECT show_id,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'aplusForrest'), 0)::int AS k1,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'aplusBagerst'), 0)::int AS k2,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'a'), 0)::int AS k3,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'b'), 0)::int AS k4
       FROM udloebne GROUP BY show_id
     )
     UPDATE seat_counters c
        SET taken_aplus_front = GREATEST(0, c.taken_aplus_front - f.k1),
            taken_aplus_back  = GREATEST(0, c.taken_aplus_back  - f.k2),
            taken_a           = GREATEST(0, c.taken_a           - f.k3),
            taken_b           = GREATEST(0, c.taken_b           - f.k4),
            updated_at        = now()
       FROM frigivet f
      WHERE c.show_id = f.show_id`,
    [showIds]
  );
}

export type Reservationssvar =
  | { ok: true }
  | {
      ok: false;
      /** Hvor mange der er tilbage i hver kategori lige nu. */
      tilbage: Pladstal;
      /** Den første kategori, der ikke var plads nok i. */
      mangler: { kategori: Kapacitetskategori; oensket: number; tilbage: number };
    };

/**
 * Reserverer pladser i 15-20 minutter. Enten reserveres ALT det ønskede, eller
 * også reserveres intet — også når bestillingen rammer flere kategorier.
 *
 * Kapaciteten sendes ind som loft, så den kan komme fra Airtable uden at
 * skulle holdes synkront med databasen.
 */
export async function reserverPladser(
  db: Queryable,
  params: {
    showId: string;
    bookingId: string;
    oensker: Pladsoenske[];
    kapaciteter: Record<Kapacitetskategori, number>;
    holdMinutter: number;
    kilde: HoldKilde;
    paymentRef?: string | null;
  }
): Promise<Reservationssvar> {
  const { showId, bookingId, oensker, kapaciteter, holdMinutter, kilde } = params;
  const oensket = summerOensker(oensker);
  const ialt = KAPACITETSKATEGORIER.reduce((s, k) => s + oensket[k], 0);
  if (ialt === 0) return { ok: true };

  // Giv først udløbne reservationer tilbage, så kunden ikke afvises på pladser,
  // ingen længere holder.
  await frigivUdloebne(db, showId);
  await sikrTaellelinje(db, showId);

  const { rows } = await db.query<TaelleRaekke>(
    `UPDATE seat_counters
        SET taken_aplus_front = taken_aplus_front + $2,
            taken_aplus_back  = taken_aplus_back  + $3,
            taken_a           = taken_a           + $4,
            taken_b           = taken_b           + $5,
            updated_at        = now()
      WHERE show_id = $1
        AND taken_aplus_front + $2 <= $6
        AND taken_aplus_back  + $3 <= $7
        AND taken_a           + $4 <= $8
        AND taken_b           + $5 <= $9
      RETURNING taken_aplus_front, taken_aplus_back, taken_a, taken_b`,
    [
      showId,
      oensket.aplusForrest,
      oensket.aplusBagerst,
      oensket.a,
      oensket.b,
      kapaciteter.aplusForrest,
      kapaciteter.aplusBagerst,
      kapaciteter.a,
      kapaciteter.b,
    ]
  );

  if (rows.length === 0) {
    // Ingen af de fire tal blev rørt. Fortæl hvor det brast, med friske tal.
    const tagne = await hentTagne(db, showId);
    const tilbage: Pladstal = { ...NUL };
    for (const k of KAPACITETSKATEGORIER) {
      tilbage[k] = Math.max(0, kapaciteter[k] - tagne[k]);
    }
    const foerste =
      KAPACITETSKATEGORIER.find((k) => oensket[k] > tilbage[k]) ??
      KAPACITETSKATEGORIER[0];
    return {
      ok: false,
      tilbage,
      mangler: {
        kategori: foerste,
        oensket: oensket[foerste],
        tilbage: tilbage[foerste],
      },
    };
  }

  // Pladserne er taget. Bogfør linjerne. Fejler det, gives pladserne tilbage
  // med det samme, så et tal aldrig kan stå og holde pladser, ingen ejer.
  try {
    for (const k of KAPACITETSKATEGORIER) {
      if (oensket[k] === 0) continue;
      const ticketTypeId =
        oensker.find((o) => o.kategori === k && o.ticketTypeId)?.ticketTypeId ?? null;
      await db.query(
        `INSERT INTO seat_holds
           (show_id, booking_id, category, quantity, status, source, payment_ref,
            ticket_type_id, expires_at)
         VALUES ($1, $2, $3, $4, 'held', $5, $6, $7, now() + make_interval(mins => $8))`,
        [
          showId,
          bookingId,
          k,
          oensket[k],
          kilde,
          params.paymentRef ?? null,
          ticketTypeId,
          holdMinutter,
        ]
      );
    }
  } catch (err) {
    await db.query(
      `UPDATE seat_counters
          SET taken_aplus_front = GREATEST(0, taken_aplus_front - $2),
              taken_aplus_back  = GREATEST(0, taken_aplus_back  - $3),
              taken_a           = GREATEST(0, taken_a           - $4),
              taken_b           = GREATEST(0, taken_b           - $5),
              updated_at        = now()
        WHERE show_id = $1`,
      [showId, oensket.aplusForrest, oensket.aplusBagerst, oensket.a, oensket.b]
    );
    throw err;
  }

  return { ok: true };
}

/**
 * Knytter betalingens reference til en allerede oprettet reservation.
 * Referencen kendes først, når betalingen er oprettet hos Viva — men
 * reservationen skal tages FØR, så kunden aldrig sendes til betaling for
 * pladser, der ikke findes.
 */
export async function knytBetalingsreference(
  db: Queryable,
  bookingId: string,
  paymentRef: string
): Promise<void> {
  await db.query(
    `UPDATE seat_holds SET payment_ref = $2 WHERE booking_id = $1 AND status = 'held'`,
    [bookingId, paymentRef]
  );
}

export interface HoldRaekke {
  showId: string;
  bookingId: string;
  kategori: Kapacitetskategori;
  antal: number;
  status: HoldStatus;
}

/** Pladsbogens linjer for en betaling. */
export async function hentHoldsForBetaling(
  db: Queryable,
  paymentRef: string
): Promise<HoldRaekke[]> {
  const { rows } = await db.query<{
    show_id: string;
    booking_id: string;
    category: string;
    quantity: number | string;
    status: HoldStatus;
  }>(
    `SELECT show_id, booking_id, category, quantity, status
       FROM seat_holds WHERE payment_ref = $1`,
    [paymentRef]
  );
  return rows.map((r) => ({
    showId: r.show_id,
    bookingId: r.booking_id,
    kategori: r.category as Kapacitetskategori,
    antal: Number(r.quantity),
    status: r.status,
  }));
}

export interface SalgsSvar {
  /** Antal linjer, der blev gjort til endeligt salg. 0 = intet at gøre. */
  linjer: number;
  /** Sand, hvis mindst én reservation var udløbet, da betalingen kom. */
  udloebet: boolean;
  showId: string | null;
}

/**
 * Gør en betalt reservation til et endeligt salg.
 *
 * Var reservationen nået at udløbe, inden betalingen kom, får kunden alligevel
 * sin billet — de har jo betalt — og pladserne tages igen. Det kan gøre
 * kategorien oversolgt; kalderen advarer kontoret om det.
 *
 * Kaldes kun af den, der vandt overgangen ubetalt → betalt i billet-ledgeren,
 * og er desuden i sig selv uskadelig at køre igen: anden kørsel finder ingen
 * linjer at ændre.
 */
export async function markerSolgt(
  db: Queryable,
  paymentRef: string
): Promise<SalgsSvar> {
  const linjer = await hentHoldsForBetaling(db, paymentRef);
  if (linjer.length === 0) return { linjer: 0, udloebet: false, showId: null };

  const showId = linjer[0].showId;
  const udloebet = linjer.some((l) => l.status === "released");
  await sikrTaellelinje(db, showId);

  // Ét greb: udløbne pladser tages igen, og linjerne gøres til salg. Ingen af
  // delene kan ske uden den anden.
  const { rows } = await db.query<{ id: string }>(
    `WITH genindsat AS (
       SELECT
         COALESCE(SUM(quantity) FILTER (WHERE category = 'aplusForrest'), 0)::int AS k1,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'aplusBagerst'), 0)::int AS k2,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'a'), 0)::int AS k3,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'b'), 0)::int AS k4
       FROM seat_holds
       WHERE payment_ref = $1 AND status = 'released'
     ), opdater AS (
       UPDATE seat_counters c
          SET taken_aplus_front = c.taken_aplus_front + g.k1,
              taken_aplus_back  = c.taken_aplus_back  + g.k2,
              taken_a           = c.taken_a           + g.k3,
              taken_b           = c.taken_b           + g.k4,
              updated_at        = now()
         FROM genindsat g
        WHERE c.show_id = $2
       RETURNING c.show_id
     )
     UPDATE seat_holds
        SET status = 'sold', expires_at = NULL
      WHERE payment_ref = $1 AND status IN ('held','released')
     RETURNING id`,
    [paymentRef, showId]
  );

  return { linjer: rows.length, udloebet, showId };
}

/**
 * Giver pladserne tilbage, når en betaling fejler eller afbrydes. Rører kun
 * reservationer — en plads, der allerede er solgt, frigives aldrig herfra.
 */
export async function frigivReservation(
  db: Queryable,
  paymentRef: string
): Promise<void> {
  await frigivEfterNoegle(db, "payment_ref", paymentRef);
}

/**
 * Som frigivReservation, men slår op på bookingen. Bruges, hvis betalingen
 * slet ikke nåede at blive oprettet — så findes der endnu ingen reference,
 * men pladserne skal stadig gives tilbage med det samme.
 */
export async function frigivForBooking(
  db: Queryable,
  bookingId: string
): Promise<void> {
  await frigivEfterNoegle(db, "booking_id", bookingId);
}

/** Fælles krop. Kolonnenavnet er fast tekst i koden — aldrig brugerinput. */
async function frigivEfterNoegle(
  db: Queryable,
  kolonne: "payment_ref" | "booking_id",
  vaerdi: string
): Promise<void> {
  await db.query(
    `WITH frigivne AS (
       UPDATE seat_holds
          SET status = 'released'
        WHERE ${kolonne} = $1 AND status = 'held'
        RETURNING show_id, category, quantity
     ), summer AS (
       SELECT show_id,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'aplusForrest'), 0)::int AS k1,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'aplusBagerst'), 0)::int AS k2,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'a'), 0)::int AS k3,
         COALESCE(SUM(quantity) FILTER (WHERE category = 'b'), 0)::int AS k4
       FROM frigivne GROUP BY show_id
     )
     UPDATE seat_counters c
        SET taken_aplus_front = GREATEST(0, c.taken_aplus_front - s.k1),
            taken_aplus_back  = GREATEST(0, c.taken_aplus_back  - s.k2),
            taken_a           = GREATEST(0, c.taken_a           - s.k3),
            taken_b           = GREATEST(0, c.taken_b           - s.k4),
            updated_at        = now()
       FROM summer s
      WHERE c.show_id = s.show_id`,
    [vaerdi]
  );
}

export interface RegistreringsSvar {
  /** Antal linjer, der faktisk blev skrevet. 0 = bookingen var talt med i forvejen. */
  registreret: number;
}

/**
 * Registrerer et salg direkte — uden reservation og UDEN loft.
 *
 * Bruges til fribilletter (personalet må give en æresgæst plads, selv om
 * kategorien er fuld — de bekræfter advarslen i admin) og til importen af
 * bookinger fra før dette system. Er bookingen allerede talt med i kategorien,
 * sker der ingenting: den unikke indeks på (booking_id, category) gør, at den
 * samme booking aldrig kan tælles to gange, uanset hvor den kommer fra.
 */
export async function registrerSalg(
  db: Queryable,
  params: {
    showId: string;
    bookingId: string;
    oensker: Pladsoenske[];
    kilde: Exclude<HoldKilde, "checkout">;
    paymentRef?: string | null;
  }
): Promise<RegistreringsSvar> {
  const { showId, bookingId, oensker, kilde } = params;
  const antal = summerOensker(oensker);
  await sikrTaellelinje(db, showId);

  let registreret = 0;
  for (const k of KAPACITETSKATEGORIER) {
    if (antal[k] === 0) continue;
    const ticketTypeId =
      oensker.find((o) => o.kategori === k && o.ticketTypeId)?.ticketTypeId ?? null;
    // Ét greb: linjen skrives, og tallet lægges til — eller ingen af delene,
    // hvis bookingen allerede står i pladsbogen for den kategori.
    const { rows } = await db.query<{ indsat: number | string }>(
      `WITH ny AS (
         INSERT INTO seat_holds
           (show_id, booking_id, category, quantity, status, source, payment_ref,
            ticket_type_id, expires_at)
         VALUES ($1, $2, $3, $4, 'sold', $5, $6, $7, NULL)
         ON CONFLICT (booking_id, category) DO NOTHING
         RETURNING quantity
       ), opdater AS (
         UPDATE seat_counters c
            SET ${KOLONNE[k]} = c.${KOLONNE[k]} +
                  COALESCE((SELECT SUM(quantity) FROM ny), 0)::int,
                updated_at = now()
          WHERE c.show_id = $1
         RETURNING c.show_id
       )
       SELECT (SELECT COUNT(*) FROM ny)::int AS indsat`,
      [showId, bookingId, k, antal[k], kilde, params.paymentRef ?? null, ticketTypeId]
    );
    registreret += Number(rows[0]?.indsat ?? 0);
  }
  return { registreret };
}
