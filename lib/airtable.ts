// Simpelt wrapper-lag omkring Airtable REST API.
// Bruger native fetch — ingen ekstra npm-pakke nødvendig.

const BASE_URL = "https://api.airtable.com/v0";

// Table- og field-ID'er fra den oprettede "Bakkens Hvile"-base.
export const TABLES = {
  events: "tblxESwUnO7mpDxc2",
  ticketTypes: "tbl8HtjJeE2lDFwe7",
  addOns: "tbliFbDuQ7xWYTtpY",
  customers: "tblyxlJyn1J594ZEp",
  bookings: "tbl2pAlbe6LXuB1u9",
} as const;

export const FIELDS = {
  event: {
    title: "fld9jcRFTaRptnfLI",
    date: "fldmcnCM2SFCDWGKB",
    time: "fldcyiXJcx6kRV0N2",
    duration: "fldvWxZwE1yru1MHW",
    notes: "fldztH9TYEEqda6Zm",
    seatingLink: "fldfK75vTcpcpZx9d",
  },
  ticketType: {
    category: "fldjmx1vfbTgxlDn0",
    price: "fldUQH5EMjpP5KhPJ",
    fee: "fldK1NBmdZyCTc0kL",
    maxCount: "fldg5GPUE2qt1HCsA",
  },
  addOn: {
    name: "fldfRo2vS99rldTUD",
    price: "fldT7yU2cBiZ3TvBz",
    category: "fldR4bGu31Z1OmXqd",
  },
  customer: {
    name: "fldJj0hE2qNJIN136",
    company: "fldYGfTjB6CBHia6M",
    address: "fld4nTPUii8qqHuad",
    zip: "fld56cqNPbtjDOGGH",
    phone: "fldZ7O9UcOLff1r8m",
    email: "fldTMMYOx0URW3fNm",
  },
  booking: {
    bookingNo: "fldnA26oRG6pJ2wID",
    specialRequests: "fldgcLmZykvBDiqNY",
    ticketCount: "fldtZDE5TUgS7WytY",
    status: "fldrSmSBnsy3Pn97U",
  },
} as const;

function headers() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN mangler i miljøvariablerne");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function baseId() {
  const id = process.env.AIRTABLE_BASE_ID;
  if (!id) throw new Error("AIRTABLE_BASE_ID mangler i miljøvariablerne");
  return id;
}

export async function listRecords(tableId: string) {
  const res = await fetch(`${BASE_URL}/${baseId()}/${tableId}`, {
    headers: headers(),
    // Data ændrer sig sjældent — cache kort for at spare kald.
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Airtable-fejl (${tableId}): ${res.status}`);
  const data = await res.json();
  return data.records as Array<{ id: string; fields: Record<string, unknown> }>;
}

export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>
) {
  const res = await fetch(`${BASE_URL}/${baseId()}/${tableId}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable-fejl ved oprettelse (${tableId}): ${body}`);
  }
  return res.json();
}

export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>
) {
  const res = await fetch(`${BASE_URL}/${baseId()}/${tableId}/${recordId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable-fejl ved opdatering (${tableId}): ${body}`);
  }
  return res.json();
}
