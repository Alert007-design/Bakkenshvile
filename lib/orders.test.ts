import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import {
  createDraftOrder,
  attachCheckoutSession,
  markOrderPaid,
  markOrderRefunded,
  getOrderForGuest,
  setFulfillmentStatus,
  listActiveOrders,
  type DraftOrderInput,
} from "@/lib/orders";
import { getHallState, setHallState, isOrderingOpen } from "@/lib/hall-state";

// pglite implementerer Queryable (query(text, params) → { rows, rowCount }).
let db: Queryable & { query: PGlite["query"] };

function draft(overrides: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    eventId: "evt1",
    tableNumber: 63,
    guestName: "Test",
    message: "Uden is",
    requestedDeliveryPhase: "now",
    subtotalOre: 8000,
    vatOre: 2000,
    totalOre: 10000,
    lines: [
      {
        menuItemId: "rec1",
        productCode: "OL-01",
        name: "Øl",
        quantity: 2,
        unitPriceOre: 5000,
        vatRate: 25,
        lineTotalOre: 10000,
      },
    ],
    ...overrides,
  };
}

// Én indlejret Postgres for hele filen (boot af WASM er dyrt). Tabellerne
// nulstilles mellem hver test, så de forbliver isolerede.
beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE orders, order_lines, hall_state RESTART IDENTITY CASCADE");
  await db.query("ALTER SEQUENCE table_order_seq RESTART");
});

describe("migration", () => {
  it("opretter tabeller og constraints", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain("orders");
    expect(names).toContain("order_lines");
    expect(names).toContain("hall_state");
  });
});

describe("createDraftOrder", () => {
  it("opretter ordre + linjer og tildeler unikt ordrenummer", async () => {
    const a = await createDraftOrder(db, draft());
    const b = await createDraftOrder(db, draft());
    expect(a.orderNumber).toMatch(/^BH-B-\d{5}$/);
    expect(a.orderNumber).not.toBe(b.orderNumber);
    expect(a.publicToken).not.toBe(b.publicToken);

    const { rows } = await db.query(`SELECT count(*) AS n FROM order_lines WHERE order_id=$1`, [a.id]);
    expect(Number((rows[0] as { n: string }).n)).toBe(1);
  });
});

describe("markOrderPaid — idempotens og beløbskontrol", () => {
  it("markerer betalt én gang og er idempotent ved gentagne kald", async () => {
    const o = await createDraftOrder(db, draft());
    await attachCheckoutSession(db, o.id, "cs_test_1");

    const first = await markOrderPaid(db, {
      sessionId: "cs_test_1",
      paymentIntentId: "pi_1",
      amountTotalOre: 10000,
      currency: "dkk",
    });
    const second = await markOrderPaid(db, {
      sessionId: "cs_test_1",
      amountTotalOre: 10000,
      currency: "dkk",
    });

    expect(first.status).toBe("paid");
    expect(second.status).toBe("already_paid");

    const { rows } = await db.query<{ payment_status: string; paid_at: string | null }>(
      `SELECT payment_status, paid_at FROM orders WHERE id=$1`,
      [o.id]
    );
    expect(rows[0].payment_status).toBe("paid");
    expect(rows[0].paid_at).not.toBeNull();
  });

  it("afviser forkert beløb", async () => {
    const o = await createDraftOrder(db, draft());
    await attachCheckoutSession(db, o.id, "cs_test_2");
    const r = await markOrderPaid(db, {
      sessionId: "cs_test_2",
      amountTotalOre: 9999,
      currency: "dkk",
    });
    expect(r.status).toBe("amount_mismatch");
    const { rows } = await db.query<{ payment_status: string }>(
      `SELECT payment_status FROM orders WHERE id=$1`,
      [o.id]
    );
    expect(rows[0].payment_status).toBe("pending");
  });

  it("afviser forkert valuta", async () => {
    const o = await createDraftOrder(db, draft());
    await attachCheckoutSession(db, o.id, "cs_test_3");
    const r = await markOrderPaid(db, {
      sessionId: "cs_test_3",
      amountTotalOre: 10000,
      currency: "eur",
    });
    expect(r.status).toBe("amount_mismatch");
  });

  it("returnerer not_found for ukendt session", async () => {
    const r = await markOrderPaid(db, {
      sessionId: "cs_unknown",
      amountTotalOre: 10000,
      currency: "dkk",
    });
    expect(r.status).toBe("not_found");
  });
});

describe("unik constraint på stripe_checkout_session_id", () => {
  it("kan ikke binde samme session til to ordrer (ingen dobbeltordre)", async () => {
    const a = await createDraftOrder(db, draft());
    const b = await createDraftOrder(db, draft());
    await attachCheckoutSession(db, a.id, "cs_dup");
    await expect(attachCheckoutSession(db, b.id, "cs_dup")).rejects.toThrow();
  });
});

describe("refundering", () => {
  it("markerer en betalt ordre som refunderet", async () => {
    const o = await createDraftOrder(db, draft());
    await attachCheckoutSession(db, o.id, "cs_refund");
    await markOrderPaid(db, { sessionId: "cs_refund", amountTotalOre: 10000, currency: "dkk" });
    expect(await markOrderRefunded(db, "cs_refund")).toBe(true);
    const { rows } = await db.query<{ payment_status: string }>(
      `SELECT payment_status FROM orders WHERE id=$1`,
      [o.id]
    );
    expect(rows[0].payment_status).toBe("refunded");
  });
});

describe("getOrderForGuest — isolation", () => {
  it("returnerer kun ordren der matcher tokenet", async () => {
    const a = await createDraftOrder(db, draft({ guestName: "Anna", tableNumber: 63 }));
    const b = await createDraftOrder(db, draft({ guestName: "Bo", tableNumber: 71 }));

    const viewA = await getOrderForGuest(db, a.publicToken);
    expect(viewA?.tableNumber).toBe(63);
    expect(viewA?.orderNumber).toBe(a.orderNumber);
    // Ingen felter fra den anden gæst.
    expect(viewA?.lines.length).toBe(1);

    const viewB = await getOrderForGuest(db, b.publicToken);
    expect(viewB?.tableNumber).toBe(71);

    // Ukendt token → null (ingen adgang).
    expect(await getOrderForGuest(db, "forkert-token")).toBeNull();
  });
});

describe("setFulfillmentStatus — gyldige overgange", () => {
  async function paidOrder() {
    const o = await createDraftOrder(db, draft());
    await attachCheckoutSession(db, o.id, `cs_${o.id}`);
    await markOrderPaid(db, { sessionId: `cs_${o.id}`, amountTotalOre: 10000, currency: "dkk" });
    return o;
  }

  it("kører forløbet new → preparing → ready → delivered og sætter tidsstempler", async () => {
    const o = await paidOrder();
    await setFulfillmentStatus(db, o.id, "preparing");
    await setFulfillmentStatus(db, o.id, "ready");
    await setFulfillmentStatus(db, o.id, "delivered");
    const { rows } = await db.query<{
      fulfillment_status: string;
      started_at: string | null;
      ready_at: string | null;
      delivered_at: string | null;
    }>(`SELECT fulfillment_status, started_at, ready_at, delivered_at FROM orders WHERE id=$1`, [o.id]);
    expect(rows[0].fulfillment_status).toBe("delivered");
    expect(rows[0].started_at).not.toBeNull();
    expect(rows[0].ready_at).not.toBeNull();
    expect(rows[0].delivered_at).not.toBeNull();
  });

  it("afviser et ugyldigt spring (new → delivered)", async () => {
    const o = await paidOrder();
    await expect(setFulfillmentStatus(db, o.id, "delivered")).rejects.toThrow();
  });

  it("afviser statusskift på en ubetalt ordre", async () => {
    const o = await createDraftOrder(db, draft());
    await expect(setFulfillmentStatus(db, o.id, "preparing")).rejects.toThrow();
  });
});

describe("listActiveOrders", () => {
  it("viser kun betalte, ikke-afsluttede ordrer for eventet, ældste først", async () => {
    const paid = await createDraftOrder(db, draft({ tableNumber: 11 }));
    await attachCheckoutSession(db, paid.id, "cs_a");
    await markOrderPaid(db, { sessionId: "cs_a", amountTotalOre: 10000, currency: "dkk" });

    // Ubetalt → skal ikke med.
    await createDraftOrder(db, draft({ tableNumber: 12 }));

    // Leveret → skal ikke med.
    const done = await createDraftOrder(db, draft({ tableNumber: 13 }));
    await attachCheckoutSession(db, done.id, "cs_b");
    await markOrderPaid(db, { sessionId: "cs_b", amountTotalOre: 10000, currency: "dkk" });
    await setFulfillmentStatus(db, done.id, "preparing");
    await setFulfillmentStatus(db, done.id, "ready");
    await setFulfillmentStatus(db, done.id, "delivered");

    // Andet event → skal ikke med.
    const other = await createDraftOrder(db, draft({ eventId: "evt2", tableNumber: 14 }));
    await attachCheckoutSession(db, other.id, "cs_c");
    await markOrderPaid(db, { sessionId: "cs_c", amountTotalOre: 10000, currency: "dkk" });

    const active = await listActiveOrders(db, "evt1");
    expect(active.map((o) => o.tableNumber)).toEqual([11]);
    expect(active[0].lines.length).toBe(1);
  });
});

describe("hall_state", () => {
  it("defaulter til ingen tilstand (lukket) og kan sættes/opdateres", async () => {
    expect(await getHallState(db, "evt1")).toBeNull();
    expect(await isOrderingOpen(db, "evt1")).toBe(false);

    await setHallState(db, "evt1", "before_show", true);
    expect(await isOrderingOpen(db, "evt1")).toBe(true);

    const hs = await setHallState(db, "evt1", "closed", false);
    expect(hs.state).toBe("closed");
    expect(await isOrderingOpen(db, "evt1")).toBe(false);

    // Stadig præcis én række pr. event (upsert).
    const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM hall_state WHERE event_id='evt1'`);
    expect(Number(rows[0].n)).toBe(1);
  });
});
