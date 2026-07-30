import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import {
  createTicketPayment,
  getTicketPayment,
  markTicketPaidByRef,
  markTicketFailedByRef,
  markTicketRefundedByRef,
  revertTicketPaidByRef,
  type CreateTicketPaymentInput,
} from "@/lib/ticket-payments";

let db: Queryable & { query: PGlite["query"] };

function input(overrides: Partial<CreateTicketPaymentInput> = {}): CreateTicketPaymentInput {
  return {
    paymentRef: "1234567890123456",
    flow: "billet",
    bookingId: "recBooking1",
    bookingNo: "BH-12345678",
    customerEmail: "gaest@eksempel.dk",
    customerName: "Test Gæst",
    expectedTotalOre: 52500,
    discountOre: 0,
    lineItems: [
      { description: "Billet: A+ — Show", quantity: 2, amountSubtotalOre: 52500 },
    ],
    ...overrides,
  };
}

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE ticket_payments");
});

describe("migration 003", () => {
  it("opretter ticket_payments-tabellen", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    );
    expect(rows.map((r) => r.table_name)).toContain("ticket_payments");
  });
});

describe("createTicketPayment / getTicketPayment", () => {
  it("gemmer og læser posten tilbage (linjer bevares)", async () => {
    await createTicketPayment(db, input());
    const row = await getTicketPayment(db, "1234567890123456");
    expect(row).not.toBeNull();
    expect(row?.flow).toBe("billet");
    expect(row?.expectedTotalOre).toBe(52500);
    expect(row?.status).toBe("pending");
    expect(row?.lineItems.length).toBe(1);
    expect(row?.lineItems[0].description).toBe("Billet: A+ — Show");
  });

  it("er robust ved dobbelt checkout (ON CONFLICT DO NOTHING)", async () => {
    await createTicketPayment(db, input());
    await createTicketPayment(db, input({ expectedTotalOre: 999 }));
    // Første post bevares — anden ignoreres.
    const row = await getTicketPayment(db, "1234567890123456");
    expect(row?.expectedTotalOre).toBe(52500);
  });
});

describe("markTicketPaidByRef — beløbskontrol + idempotens", () => {
  it("markerer betalt ved korrekt beløb", async () => {
    await createTicketPayment(db, input());
    const r = await markTicketPaidByRef(db, {
      paymentRef: "1234567890123456",
      amountOre: 52500,
      currency: "dkk",
    });
    expect(r.status).toBe("paid");
    const row = await getTicketPayment(db, "1234567890123456");
    expect(row?.status).toBe("paid");
  });

  it("forkert beløb → amount_mismatch, bookingen forbliver ubetalt", async () => {
    await createTicketPayment(db, input());
    const r = await markTicketPaidByRef(db, {
      paymentRef: "1234567890123456",
      amountOre: 50000, // for lidt
      currency: "dkk",
    });
    expect(r.status).toBe("amount_mismatch");
    const row = await getTicketPayment(db, "1234567890123456");
    expect(row?.status).toBe("pending");
  });

  it("forkert valuta → amount_mismatch", async () => {
    await createTicketPayment(db, input());
    const r = await markTicketPaidByRef(db, {
      paymentRef: "1234567890123456",
      amountOre: 52500,
      currency: "eur",
    });
    expect(r.status).toBe("amount_mismatch");
  });

  it("ukendt reference → not_found (fail-closed)", async () => {
    const r = await markTicketPaidByRef(db, {
      paymentRef: "0000000000000000",
      amountOre: 52500,
      currency: "dkk",
    });
    expect(r.status).toBe("not_found");
  });

  it("samme betaling to gange → markeres betalt præcis én gang", async () => {
    await createTicketPayment(db, input());
    const a = await markTicketPaidByRef(db, {
      paymentRef: "1234567890123456",
      amountOre: 52500,
      currency: "dkk",
    });
    const b = await markTicketPaidByRef(db, {
      paymentRef: "1234567890123456",
      amountOre: 52500,
      currency: "dkk",
    });
    expect(a.status).toBe("paid");
    expect(b.status).toBe("already_paid");
  });

  it("er idempotent ved to samtidige kald (kun én vinder)", async () => {
    await createTicketPayment(db, input());
    const [a, b] = await Promise.all([
      markTicketPaidByRef(db, { paymentRef: "1234567890123456", amountOre: 52500, currency: "dkk" }),
      markTicketPaidByRef(db, { paymentRef: "1234567890123456", amountOre: 52500, currency: "dkk" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["already_paid", "paid"]);
  });
});

describe("revert / failed / refunded", () => {
  it("revert frigiver en vundet paid-overgang igen (til pending)", async () => {
    await createTicketPayment(db, input());
    await markTicketPaidByRef(db, { paymentRef: "1234567890123456", amountOre: 52500, currency: "dkk" });
    await revertTicketPaidByRef(db, "1234567890123456");
    const row = await getTicketPayment(db, "1234567890123456");
    expect(row?.status).toBe("pending");
  });

  it("markTicketFailedByRef kun fra pending", async () => {
    await createTicketPayment(db, input());
    expect(await markTicketFailedByRef(db, "1234567890123456")).toBe(true);
    const row = await getTicketPayment(db, "1234567890123456");
    expect(row?.status).toBe("failed");
    // Kan ikke fejle igen.
    expect(await markTicketFailedByRef(db, "1234567890123456")).toBe(false);
  });

  it("markTicketRefundedByRef kun fra paid", async () => {
    await createTicketPayment(db, input());
    // Ikke betalt endnu → ingen refundering.
    expect(await markTicketRefundedByRef(db, "1234567890123456")).toBe(false);
    await markTicketPaidByRef(db, { paymentRef: "1234567890123456", amountOre: 52500, currency: "dkk" });
    expect(await markTicketRefundedByRef(db, "1234567890123456")).toBe(true);
    const row = await getTicketPayment(db, "1234567890123456");
    expect(row?.status).toBe("refunded");
  });
});
