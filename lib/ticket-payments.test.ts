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

// Scenarie fra virkeligheden: kundens kort afvises, Viva sender en Transaction
// Failed-webhook, og kunden betaler derefter med et andet kort på den SAMME
// betalingsside. Viva skriver udtrykkeligt, at en fejlet betaling ikke er en
// endelig status, og at en betalt-webhook kan følge efter på samme orderCode:
// https://developer.viva.com/webhooks-for-payments/transaction-failed
describe("fejlet → betalt (afvist kort, betalt med et andet)", () => {
  const REF = "1234567890123456";

  it("billetten kan stadig betales, efter at et forsøg er fejlet", async () => {
    await createTicketPayment(db, input());
    expect(await markTicketFailedByRef(db, REF)).toBe(true);

    const r = await markTicketPaidByRef(db, {
      paymentRef: REF,
      amountOre: 52500,
      currency: "dkk",
    });
    // "paid" er dét, der får kalderen til at opdatere Airtable og sende
    // billetten — kunden må ikke gå tomhændet fra en betaling.
    expect(r.status).toBe("paid");
    expect((await getTicketPayment(db, REF))?.status).toBe("paid");
  });

  it("beløbskontrollen gælder stadig, når posten stod som fejlet", async () => {
    await createTicketPayment(db, input());
    await markTicketFailedByRef(db, REF);

    const r = await markTicketPaidByRef(db, {
      paymentRef: REF,
      amountOre: 1,
      currency: "dkk",
    });
    expect(r.status).toBe("amount_mismatch");
    expect((await getTicketPayment(db, REF))?.status).toBe("failed");
  });

  it("samme betalt-webhook to gange giver stadig kun én ordre", async () => {
    await createTicketPayment(db, input());
    await markTicketFailedByRef(db, REF);

    const foerste = await markTicketPaidByRef(db, {
      paymentRef: REF,
      amountOre: 52500,
      currency: "dkk",
    });
    const anden = await markTicketPaidByRef(db, {
      paymentRef: REF,
      amountOre: 52500,
      currency: "dkk",
    });
    expect(foerste.status).toBe("paid");
    expect(anden.status).toBe("already_paid");
  });

  it("to samtidige betalt-webhooks fra fejlet: præcis én vinder overgangen", async () => {
    await createTicketPayment(db, input());
    await markTicketFailedByRef(db, REF);

    const [a, b] = await Promise.all([
      markTicketPaidByRef(db, { paymentRef: REF, amountOre: 52500, currency: "dkk" }),
      markTicketPaidByRef(db, { paymentRef: REF, amountOre: 52500, currency: "dkk" }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["already_paid", "paid"]);
  });

  it("en genbestilling kan også betales efter et fejlet forsøg", async () => {
    await createTicketPayment(db, input({ flow: "genbestil" }));
    expect(await markTicketFailedByRef(db, REF)).toBe(true);

    const r = await markTicketPaidByRef(db, {
      paymentRef: REF,
      amountOre: 52500,
      currency: "dkk",
    });
    expect(r.status).toBe("paid");
    expect(r.status === "paid" && r.payment.flow).toBe("genbestil");
    expect((await getTicketPayment(db, REF))?.status).toBe("paid");
  });

  it("genbestilling: samme webhook to gange lægger kun tilvalgene på én gang", async () => {
    await createTicketPayment(db, input({ flow: "genbestil" }));
    await markTicketFailedByRef(db, REF);

    // Webhooken lægger KUN tilvalgene på bookingen, når resultatet er "paid".
    // Her tælles, hvor mange gange det sker — det skal være præcis én.
    let tilvalgLagtPaa = 0;
    for (let i = 0; i < 3; i++) {
      const r = await markTicketPaidByRef(db, {
        paymentRef: REF,
        amountOre: 52500,
        currency: "dkk",
      });
      if (r.status === "paid") tilvalgLagtPaa++;
    }
    expect(tilvalgLagtPaa).toBe(1);
  });

  it("genbestilling: to samtidige betalt-webhooks fra fejlet giver kun én", async () => {
    await createTicketPayment(db, input({ flow: "genbestil" }));
    await markTicketFailedByRef(db, REF);

    const [a, b] = await Promise.all([
      markTicketPaidByRef(db, { paymentRef: REF, amountOre: 52500, currency: "dkk" }),
      markTicketPaidByRef(db, { paymentRef: REF, amountOre: 52500, currency: "dkk" }),
    ]);
    expect([a.status, b.status].sort()).toEqual(["already_paid", "paid"]);
  });

  it("en betalt billet kan ikke sættes tilbage til fejlet af en forsinket webhook", async () => {
    await createTicketPayment(db, input());
    await markTicketPaidByRef(db, { paymentRef: REF, amountOre: 52500, currency: "dkk" });
    expect(await markTicketFailedByRef(db, REF)).toBe(false);
    expect((await getTicketPayment(db, REF))?.status).toBe("paid");
  });
});
