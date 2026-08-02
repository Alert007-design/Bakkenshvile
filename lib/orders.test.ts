import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import {
  createDraftOrder,
  attachPaymentRef,
  getPaymentRef,
  markOrderPaidByRef,
  markOrderRefundedByRef,
  getOrderForGuest,
  setFulfillmentStatus,
  listActiveOrders,
  type DraftOrderInput,
} from "@/lib/orders";
import {
  getHallState,
  setHallState,
  isOrderingOpen,
  getActiveEvent,
  activateEvent,
} from "@/lib/hall-state";

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

  it("002 tilføjer payment_provider/ref/txn-kolonner", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='orders' AND table_schema='public'`
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("payment_provider");
    expect(cols).toContain("payment_ref");
    expect(cols).toContain("payment_txn_id");
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

describe("attachPaymentRef / getPaymentRef", () => {
  it("gemmer og læser referencen tilbage", async () => {
    const o = await createDraftOrder(db, draft());
    expect(await getPaymentRef(db, o.id)).toBeNull();
    await attachPaymentRef(db, o.id, "viva", "1234567890123456");
    expect(await getPaymentRef(db, o.id)).toBe("1234567890123456");
  });
});

describe("markOrderPaidByRef — idempotens og beløbskontrol", () => {
  it("markerer betalt én gang og er idempotent ved gentagne kald", async () => {
    const o = await createDraftOrder(db, draft());
    await attachPaymentRef(db, o.id, "viva", "viva_ref_1");

    const first = await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: "viva_ref_1",
      transactionId: "pi_1",
      amountTotalOre: 10000,
      currency: "dkk",
    });
    const second = await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: "viva_ref_1",
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

  it("er idempotent ved to samtidige kald (kun én bliver 'paid')", async () => {
    const o = await createDraftOrder(db, draft());
    await attachPaymentRef(db, o.id, "viva", "1000000000000001");

    const [a, b] = await Promise.all([
      markOrderPaidByRef(db, {
        provider: "viva",
        paymentRef: "1000000000000001",
        amountTotalOre: 10000,
        currency: "dkk",
      }),
      markOrderPaidByRef(db, {
        provider: "viva",
        paymentRef: "1000000000000001",
        amountTotalOre: 10000,
        currency: "dkk",
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["already_paid", "paid"]);
  });

  it("afviser forkert beløb (amount_mismatch, forbliver pending)", async () => {
    const o = await createDraftOrder(db, draft());
    await attachPaymentRef(db, o.id, "viva", "viva_ref_2");
    const r = await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: "viva_ref_2",
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
    await attachPaymentRef(db, o.id, "viva", "viva_ref_3");
    const r = await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: "viva_ref_3",
      amountTotalOre: 10000,
      currency: "eur",
    });
    expect(r.status).toBe("amount_mismatch");
  });

  it("returnerer not_found for ukendt reference", async () => {
    const r = await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: "viva_ref_unknown",
      amountTotalOre: 10000,
      currency: "dkk",
    });
    expect(r.status).toBe("not_found");
  });

});

describe("unik constraint på (payment_provider, payment_ref)", () => {
  it("kan ikke binde samme betaling til to ordrer (ingen dobbeltordre)", async () => {
    const a = await createDraftOrder(db, draft());
    const b = await createDraftOrder(db, draft());
    await attachPaymentRef(db, a.id, "viva", "9999999999999999");
    await expect(
      attachPaymentRef(db, b.id, "viva", "9999999999999999")
    ).rejects.toThrow();
  });
});

describe("refundering", () => {
  it("markerer en betalt ordre som refunderet", async () => {
    const o = await createDraftOrder(db, draft());
    await attachPaymentRef(db, o.id, "viva", "viva_ref_refund");
    await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: "viva_ref_refund",
      amountTotalOre: 10000,
      currency: "dkk",
    });
    expect(await markOrderRefundedByRef(db, "viva", "viva_ref_refund")).toBe(true);
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
    await attachPaymentRef(db, o.id, "viva", `viva_ref_${o.id}`);
    await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: `viva_ref_${o.id}`,
      amountTotalOre: 10000,
      currency: "dkk",
    });
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
  async function pay(id: string, ref: string) {
    await attachPaymentRef(db, id, "viva", ref);
    await markOrderPaidByRef(db, {
      provider: "viva",
      paymentRef: ref,
      amountTotalOre: 10000,
      currency: "dkk",
    });
  }

  it("viser kun betalte, ikke-afsluttede ordrer for eventet, ældste først", async () => {
    const paid = await createDraftOrder(db, draft({ tableNumber: 11 }));
    await pay(paid.id, "viva_ref_a");

    // Ubetalt → skal ikke med.
    await createDraftOrder(db, draft({ tableNumber: 12 }));

    // Leveret → skal ikke med.
    const done = await createDraftOrder(db, draft({ tableNumber: 13 }));
    await pay(done.id, "viva_ref_b");
    await setFulfillmentStatus(db, done.id, "preparing");
    await setFulfillmentStatus(db, done.id, "ready");
    await setFulfillmentStatus(db, done.id, "delivered");

    // Andet event → skal ikke med.
    const other = await createDraftOrder(db, draft({ eventId: "evt2", tableNumber: 14 }));
    await pay(other.id, "viva_ref_c");

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

  it("activateEvent åbner ét event og lukker alle andre", async () => {
    await setHallState(db, "evt1", "show", true);
    await activateEvent(db, "evt2", "before_show");

    const active = await getActiveEvent(db);
    expect(active?.eventId).toBe("evt2");
    expect(active?.orderingOpen).toBe(true);
    // evt1 er nu lukket.
    expect(await isOrderingOpen(db, "evt1")).toBe(false);
  });

  it("getActiveEvent er null når intet event er åbent", async () => {
    await setHallState(db, "evt1", "closed", false);
    expect(await getActiveEvent(db)).toBeNull();
  });
});
