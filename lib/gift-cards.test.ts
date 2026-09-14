import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type Queryable } from "@/lib/db";
import {
  createGiftCard,
  getGiftCardByRef,
  getGiftCardByCode,
  listGiftCards,
  markGiftCardPaidByRef,
  markGiftCardFailedByRef,
  markGiftCardRefundedByRef,
  revertGiftCardPaidByRef,
  markGiftCardUsed,
  generateGiftCardCode,
  type CreateGiftCardInput,
} from "@/lib/gift-cards";

let db: Queryable & { query: PGlite["query"] };

const REF = "1234567890123456";

function input(overrides: Partial<CreateGiftCardInput> = {}): CreateGiftCardInput {
  return {
    paymentRef: REF,
    giftCardNo: "GK-12345678",
    amountOre: 50000,
    purchaserName: "Test Køber",
    purchaserEmail: "koeber@eksempel.dk",
    purchaserPhone: null,
    recipientEmail: "modtager@eksempel.dk",
    message: "Tillykke!",
    ...overrides,
  };
}

async function pay(ref = REF, amountOre = 50000, currency = "dkk") {
  return markGiftCardPaidByRef(db, { paymentRef: ref, amountOre, currency });
}

beforeAll(async () => {
  db = new PGlite() as unknown as Queryable & { query: PGlite["query"] };
  await applyMigrations(db);
});

beforeEach(async () => {
  await db.query("TRUNCATE gift_cards");
});

describe("migration 004", () => {
  it("opretter gift_cards-tabellen", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    expect(rows.map((r) => r.table_name)).toContain("gift_cards");
  });
});

describe("generateGiftCardCode", () => {
  it("har formatet BH-XXXX-XXXX uden 0/1/I/O", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateGiftCardCode();
      expect(code).toMatch(/^BH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});

describe("createGiftCard / getGiftCardByRef", () => {
  it("gemmer og læser posten tilbage (pending, ingen kode endnu)", async () => {
    await createGiftCard(db, input());
    const row = await getGiftCardByRef(db, REF);
    expect(row).not.toBeNull();
    expect(row?.status).toBe("pending");
    expect(row?.code).toBeNull();
    expect(row?.amountOre).toBe(50000);
    expect(row?.recipientEmail).toBe("modtager@eksempel.dk");
    expect(row?.expiresAt).toBeNull();
  });

  it("er robust ved dobbelt checkout (ON CONFLICT DO NOTHING)", async () => {
    await createGiftCard(db, input());
    await createGiftCard(db, input({ amountOre: 999 }));
    const row = await getGiftCardByRef(db, REF);
    expect(row?.amountOre).toBe(50000);
  });
});

describe("markGiftCardPaidByRef — beløbskontrol, kode + udløb, idempotens", () => {
  it("markerer betalt, sætter unik kode og 3 års udløb", async () => {
    await createGiftCard(db, input());
    const r = await pay();
    expect(r.status).toBe("paid");
    const row = await getGiftCardByRef(db, REF);
    expect(row?.status).toBe("paid");
    expect(row?.code).toMatch(/^BH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(row?.expiresAt).not.toBeNull();
    const years =
      new Date(row!.expiresAt!).getFullYear() - new Date().getFullYear();
    expect(years).toBe(3);
  });

  it("forkert beløb → amount_mismatch, forbliver ubetalt uden kode", async () => {
    await createGiftCard(db, input());
    const r = await pay(REF, 40000);
    expect(r.status).toBe("amount_mismatch");
    const row = await getGiftCardByRef(db, REF);
    expect(row?.status).toBe("pending");
    expect(row?.code).toBeNull();
  });

  it("forkert valuta → amount_mismatch", async () => {
    await createGiftCard(db, input());
    const r = await pay(REF, 50000, "eur");
    expect(r.status).toBe("amount_mismatch");
  });

  it("ukendt reference → not_found (fail-closed)", async () => {
    const r = await pay("0000000000000000");
    expect(r.status).toBe("not_found");
  });

  it("samme betaling to gange → betalt præcis én gang, koden bevares", async () => {
    await createGiftCard(db, input());
    const a = await pay();
    const b = await pay();
    expect(a.status).toBe("paid");
    expect(b.status).toBe("already_paid");
    if (a.status === "paid" && b.status === "already_paid") {
      expect(b.card.code).toBe(a.card.code);
    }
  });

  it("er idempotent ved to samtidige kald (kun én vinder)", async () => {
    await createGiftCard(db, input());
    const [a, b] = await Promise.all([pay(), pay()]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["already_paid", "paid"]);
  });
});

describe("revert / failed / refunded", () => {
  it("revert frigiver paid igen (pending) og rydder kode + udløb", async () => {
    await createGiftCard(db, input());
    await pay();
    await revertGiftCardPaidByRef(db, REF);
    const row = await getGiftCardByRef(db, REF);
    expect(row?.status).toBe("pending");
    expect(row?.code).toBeNull();
    expect(row?.expiresAt).toBeNull();
  });

  it("markGiftCardFailedByRef kun fra pending", async () => {
    await createGiftCard(db, input());
    expect(await markGiftCardFailedByRef(db, REF)).toBe(true);
    const row = await getGiftCardByRef(db, REF);
    expect(row?.status).toBe("failed");
    expect(await markGiftCardFailedByRef(db, REF)).toBe(false);
  });

  it("markGiftCardRefundedByRef kun fra paid", async () => {
    await createGiftCard(db, input());
    expect(await markGiftCardRefundedByRef(db, REF)).toBe(false);
    await pay();
    expect(await markGiftCardRefundedByRef(db, REF)).toBe(true);
    const row = await getGiftCardByRef(db, REF);
    expect(row?.status).toBe("refunded");
  });
});

describe("indløsning: getGiftCardByCode / markGiftCardUsed", () => {
  it("finder på kode og markerer betalt kort som brugt", async () => {
    await createGiftCard(db, input());
    const paid = await pay();
    const code = paid.status === "paid" ? paid.card.code! : "";
    const found = await getGiftCardByCode(db, code);
    expect(found?.paymentRef).toBe(REF);

    const used = await markGiftCardUsed(db, code, "personale");
    expect(used.status).toBe("used");
    const row = await getGiftCardByRef(db, REF);
    expect(row?.status).toBe("used");
    expect(row?.usedBy).toBe("personale");
  });

  it("normaliserer koden (whitespace/små bogstaver)", async () => {
    await createGiftCard(db, input());
    const paid = await pay();
    const code = paid.status === "paid" ? paid.card.code! : "";
    const used = await markGiftCardUsed(db, `  ${code.toLowerCase()}  `, "personale");
    expect(used.status).toBe("used");
  });

  it("ukendt kode → not_found", async () => {
    const r = await markGiftCardUsed(db, "BH-ZZZZ-ZZZZ", "personale");
    expect(r.status).toBe("not_found");
  });

  it("ikke-betalt kort kan ikke bruges → not_payable", async () => {
    await createGiftCard(db, input());
    await pay();
    // Brug det én gang.
    const paid = await getGiftCardByRef(db, REF);
    await markGiftCardUsed(db, paid!.code!, "personale");
    // Andet forsøg → not_payable (allerede brugt).
    const again = await markGiftCardUsed(db, paid!.code!, "personale");
    expect(again.status).toBe("not_payable");
  });
});

describe("listGiftCards", () => {
  it("returnerer nyeste først", async () => {
    await createGiftCard(db, input({ paymentRef: "1111111111111111", giftCardNo: "GK-1" }));
    await createGiftCard(db, input({ paymentRef: "2222222222222222", giftCardNo: "GK-2" }));
    const rows = await listGiftCards(db);
    expect(rows.length).toBe(2);
  });
});
