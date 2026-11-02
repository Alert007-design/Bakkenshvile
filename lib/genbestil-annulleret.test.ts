import { describe, it, expect, vi, beforeEach } from "vitest";

const findRecords = vi.fn();
const getRecord = vi.fn();

vi.mock("@/lib/airtable", async () => {
  const faktisk = await vi.importActual<typeof import("@/lib/airtable")>("@/lib/airtable");
  return { ...faktisk, findRecords: (...a: unknown[]) => findRecords(...a), getRecord: (...a: unknown[]) => getRecord(...a) };
});

import { authenticateBooking } from "@/lib/genbestil";
import { FIELDS } from "@/lib/airtable";

function booking(status: string) {
  return {
    id: "recBooking0000001",
    fields: {
      [FIELDS.booking.bookingNo]: "BH-K7M2Q9XR",
      [FIELDS.booking.status]: status,
      [FIELDS.booking.key]: "hemmelig-noegle-1234567890",
      [FIELDS.booking.customer]: ["recKunde000000001"],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getRecord.mockResolvedValue({ id: "recKunde000000001", fields: { [FIELDS.customer.email]: "gaest@eksempel.dk" } });
});

describe("genbestilling på annullerede bookinger", () => {
  it("lader en betalt booking logge ind med nøgle", async () => {
    findRecords.mockResolvedValue([booking("Betalt")]);
    expect(await authenticateBooking({ ref: "BH-K7M2Q9XR", key: "hemmelig-noegle-1234567890" })).not.toBeNull();
  });
  it("afviser en annulleret booking, selv med den rigtige nøgle", async () => {
    findRecords.mockResolvedValue([booking("Annulleret")]);
    expect(await authenticateBooking({ ref: "BH-K7M2Q9XR", key: "hemmelig-noegle-1234567890" })).toBeNull();
  });
  it("afviser en annulleret booking, selv med den rigtige e-mail", async () => {
    findRecords.mockResolvedValue([booking("Annulleret")]);
    expect(await authenticateBooking({ bookingNo: "BH-K7M2Q9XR", email: "gaest@eksempel.dk" })).toBeNull();
  });
});
