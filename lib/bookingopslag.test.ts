import { describe, it, expect } from "vitest";
import { gyldigtOpslagsnummer, bygOpslag } from "./bookingopslag";
import { FIELDS } from "./airtable";

describe("gyldigtOpslagsnummer", () => {
  it("ensretter og godtager kendte formater", () => {
    expect(gyldigtOpslagsnummer(" bh-k7m2q9xr ")).toBe("BH-K7M2Q9XR");
    expect(gyldigtOpslagsnummer("BH260717268")).toBe("BH260717268");
    expect(gyldigtOpslagsnummer("BH-FRI-ABCDEFGH")).toBe("BH-FRI-ABCDEFGH");
  });

  it("afviser tomt og alt, der kan bruges til at snyde søgningen", () => {
    expect(gyldigtOpslagsnummer("")).toBeNull();
    expect(gyldigtOpslagsnummer(undefined)).toBeNull();
    expect(gyldigtOpslagsnummer('BH1" OR 1=1')).toBeNull();
    expect(gyldigtOpslagsnummer("BH{x}")).toBeNull();
    expect(gyldigtOpslagsnummer("A".repeat(41))).toBeNull();
  });
});

describe("bygOpslag", () => {
  const booking = {
    id: "recB",
    createdTime: "2026-10-31T12:00:00.000Z",
    fields: {
      [FIELDS.booking.bookingNo]: "BH260717268",
      [FIELDS.booking.status]: "Betalt",
      [FIELDS.booking.ticketCount]: 3,
      [FIELDS.booking.ticketBreakdown]: "A+ (1.-2.-3. række) x2, B (10. række) x1",
      [FIELDS.booking.addons]: "Aperol Spritz x2",
      [FIELDS.booking.specialRequests]: "Kørestol | Fra TicketCloud, gl. bord 12",
      [FIELDS.booking.gaestenummer]: 14,
      [FIELDS.booking.bestilt]: "2026-07-20T11:32:59.000Z",
      [FIELDS.booking.tableNumber]: "12+101",
      [FIELDS.booking.totalPaid]: 1890,
    },
  };
  const kunde = {
    id: "recK",
    fields: {
      [FIELDS.customer.name]: "Hanne Jensen",
      [FIELDS.customer.email]: "hanne@eksempel.dk",
      [FIELDS.customer.phone]: "12345678",
    },
  };

  it("samler bookingen, kunden og forestillingen", () => {
    const o = bygOpslag(booking, kunde, { title: "Sommershow", date: "2027-06-05", time: "20:00" });
    expect(o.bookingNo).toBe("BH260717268");
    expect(o.gaestenummer).toBe(14);
    expect(o.bestilt).toBe("2026-07-20T11:32:59.000Z");
    expect(o.billetter).toEqual([
      { kategori: "A+ (1.-2.-3. række)", antal: 2 },
      { kategori: "B (10. række)", antal: 1 },
    ]);
    expect(o.bemaerkning).toBe("Kørestol");
    expect(o.saerligeOenskerRaa).toBe("Kørestol | Fra TicketCloud, gl. bord 12");
    expect(o.tilvalg).toBe("Aperol Spritz x2");
    expect(o.betaltIAlt).toBe(1890);
    expect(o.kunde.navn).toBe("Hanne Jensen");
    expect(o.kunde.email).toBe("hanne@eksempel.dk");
    expect(o.forestilling).toEqual({ title: "Sommershow", date: "2027-06-05", time: "20:00" });
  });

  it("bruger oprettelsestidspunktet, når Bestilt er tomt, og tåler manglende kunde", () => {
    const uden = { ...booking, fields: { ...booking.fields, [FIELDS.booking.bestilt]: undefined } };
    const o = bygOpslag(uden, null, null);
    expect(o.bestilt).toBe("2026-10-31T12:00:00.000Z");
    expect(o.kunde.navn).toBe("");
    expect(o.forestilling).toBeNull();
  });
});
