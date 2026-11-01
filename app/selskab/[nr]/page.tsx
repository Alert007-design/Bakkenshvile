import BookingShell from "../../components/BookingShell";
import SelskabBetalClient from "../../components/SelskabBetalClient";
import { hentSideVisning } from "@/lib/selskab";
import { faelles } from "@/lib/selskab-server";
import { getMenuItems } from "@/lib/menu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Betal jeres billetter — Bakkens Hvile",
  robots: { index: false, follow: false },
};

// Selskabets betalingsside. Linket fra mailen indeholder bookingnummer og en
// hemmelig nøgle; uden den rigtige nøgle vises intet om bookingen.
export default async function Page({
  params,
  searchParams,
}: {
  params: { nr: string };
  searchParams: { k?: string };
}) {
  const noegle = typeof searchParams.k === "string" ? searchParams.k : "";
  let visning = null;
  try {
    visning = await hentSideVisning(
      {
        db: faelles.db,
        hentShow: faelles.hentShow,
        hentBilletTyper: faelles.hentBilletTyper,
        findBooking: faelles.findBooking,
        hentTilvalg: faelles.hentTilvalg,
        rabatAktiv: faelles.rabatAktiv,
        idag: faelles.idag(),
      },
      decodeURIComponent(params.nr),
      noegle
    );
  } catch {
    visning = null;
  }
  const menu = visning ? await getMenuItems() : [];
  return (
    <BookingShell>
      <SelskabBetalClient
        visning={visning}
        noegle={noegle}
        menu={menu.map((m) => ({
          id: m.id,
          name: m.name,
          price: m.unitPriceOre / 100,
          category: m.group,
        }))}
      />
    </BookingShell>
  );
}
