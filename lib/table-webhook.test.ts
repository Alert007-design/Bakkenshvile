import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type Stripe from "stripe";
import { applyMigrations, type Queryable } from "@/lib/db";
import { createDraftOrder, attachPaymentRef, type DraftOrderInput } from "@/lib/orders";
import { handleTableWebhookEvent } from "@/lib/table-webhook";

let db: Queryable;

function draft(): DraftOrderInput {
  return {
    eventId: "evt1",
    tableNumber: 63,
    guestName: "Test",
    requestedDeliveryPhase: "now",
    subtotalOre: 8000,
    vatOre: 2000,
    totalOre: 10000,
    lines: [
      {
        menuItemId: "rec1",
        productCode: "OL",
        name: "Øl",
        quantity: 2,
        unitPriceOre: 5000,
        vatRate: 25,
        lineTotalOre: 10000,
      },
    ],
  };
}

// Byg et minimalt checkout.session.completed-event.
function sessionEvent(
  type: string,
  session: Partial<Stripe.Checkout.Session>
): Stripe.Event {
  return {
    type,
    data: { object: { object: "checkout.session", ...session } },
  } as unknown as Stripe.Event;
}

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable;
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE orders, order_lines, hall_state RESTART IDENTITY CASCADE");
  await db.query("ALTER SEQUENCE table_order_seq RESTART");
});

async function paidOrderSession(sessionId: string) {
  const o = await createDraftOrder(db, draft());
  await attachPaymentRef(db, o.id, "stripe", sessionId);
  return o;
}

describe("handleTableWebhookEvent", () => {
  it("markerer betalt ved completed med payment_status=paid", async () => {
    await paidOrderSession("cs_1");
    const outcome = await handleTableWebhookEvent(
      db,
      sessionEvent("checkout.session.completed", {
        id: "cs_1",
        payment_status: "paid",
        amount_total: 10000,
        currency: "dkk",
        payment_intent: "pi_1",
        metadata: { kind: "table-order" },
      })
    );
    expect(outcome.handled).toBe(true);
    if (outcome.handled) expect((outcome.result as { status: string }).status).toBe("paid");
  });

  it("ignorerer sessions der ikke er table-order (billet-webhook ejer dem)", async () => {
    const outcome = await handleTableWebhookEvent(
      db,
      sessionEvent("checkout.session.completed", {
        id: "cs_ticket",
        payment_status: "paid",
        amount_total: 10000,
        currency: "dkk",
        metadata: { bookingId: "recX" },
      })
    );
    expect(outcome.handled).toBe(false);
  });

  it("er idempotent ved gentagne completed-events (kun én betaling)", async () => {
    await paidOrderSession("cs_2");
    const ev = sessionEvent("checkout.session.completed", {
      id: "cs_2",
      payment_status: "paid",
      amount_total: 10000,
      currency: "dkk",
      metadata: { kind: "table-order" },
    });
    const a = await handleTableWebhookEvent(db, ev);
    const b = await handleTableWebhookEvent(db, ev);
    if (a.handled) expect((a.result as { status: string }).status).toBe("paid");
    if (b.handled) expect((b.result as { status: string }).status).toBe("already_paid");
  });

  it("afviser forkert beløb (amount_mismatch, forbliver pending)", async () => {
    const o = await paidOrderSession("cs_3");
    const outcome = await handleTableWebhookEvent(
      db,
      sessionEvent("checkout.session.completed", {
        id: "cs_3",
        payment_status: "paid",
        amount_total: 9999,
        currency: "dkk",
        metadata: { kind: "table-order" },
      })
    );
    if (outcome.handled) expect((outcome.result as { status: string }).status).toBe("amount_mismatch");
    const { rows } = await db.query<{ payment_status: string }>(
      `SELECT payment_status FROM orders WHERE id=$1`,
      [o.id]
    );
    expect(rows[0].payment_status).toBe("pending");
  });

  it("frigiver IKKE levering hvis payment_status ikke er paid", async () => {
    const o = await paidOrderSession("cs_4");
    await handleTableWebhookEvent(
      db,
      sessionEvent("checkout.session.completed", {
        id: "cs_4",
        payment_status: "unpaid",
        amount_total: 10000,
        currency: "dkk",
        metadata: { kind: "table-order" },
      })
    );
    const { rows } = await db.query<{ payment_status: string }>(
      `SELECT payment_status FROM orders WHERE id=$1`,
      [o.id]
    );
    expect(rows[0].payment_status).toBe("pending");
  });

  it("markerer fejlet ved expired", async () => {
    const o = await paidOrderSession("cs_5");
    await handleTableWebhookEvent(
      db,
      sessionEvent("checkout.session.expired", {
        id: "cs_5",
        metadata: { kind: "table-order" },
      })
    );
    const { rows } = await db.query<{ payment_status: string }>(
      `SELECT payment_status FROM orders WHERE id=$1`,
      [o.id]
    );
    expect(rows[0].payment_status).toBe("failed");
  });
});
