import { listRecords, TABLES, FIELDS } from "@/lib/airtable";
import GenbestilClient from "../components/GenbestilClient";
import BookingShell from "../components/BookingShell";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Genbestilling af tilvalg — Bakkens Hvile",
  description: "Log ind med dit bestillingsnummer og bestil ekstra drikkevarer til din booking.",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: { ref?: string; n?: string };
}) {
  const addOns = await listRecords(TABLES.addOns);
  const addons = addOns.map((r) => ({
    id: r.id,
    name: String(r.fields[FIELDS.addOn.name] ?? ""),
    price: Number(r.fields[FIELDS.addOn.price] ?? 0),
    category: String(r.fields[FIELDS.addOn.category] ?? "Andet"),
  }));

  const initialRef = typeof searchParams.ref === "string" ? searchParams.ref : "";
  const initialKey = typeof searchParams.n === "string" ? searchParams.n : "";

  return (
    <BookingShell>
      <GenbestilClient
        addons={addons}
        initialRef={initialRef}
        initialKey={initialKey}
      />
    </BookingShell>
  );
}
