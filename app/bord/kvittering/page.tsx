// Vivas fælles success-URL for bordbestilling (sat i Vivas dashboard). Viva
// hægter selv ?s={orderCode}&t={transactionId}&lang=.. på — men orderCode er
// IKKE hemmelig og må aldrig alene give adgang til ordren.
//
// Vi finder derfor ordren via den httpOnly-cookie (bh_bord_ordre =
// publicToken), som checkout-ruten satte før redirect. Findes cookien,
// videresendes gæsten til den eksisterende kvitteringsside, der bruger det
// hemmelige token. Findes den ikke (anden browser, ryddede cookies), vises en
// pæn, ufølsom besked.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getOrderForGuest } from "@/lib/orders";
import "../bord.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function VivaKvitteringPage() {
  const token = cookies().get("bh_bord_ordre")?.value;

  if (token) {
    const order = await getOrderForGuest(getDb(), token);
    if (order) {
      redirect(`/bord/${order.tableNumber}/kvittering?t=${token}`);
    }
  }

  // Ingen (gyldig) cookie: vis en venlig, ufølsom bekræftelse.
  return (
    <div className="bord">
      <div className="bord-msg">
        <h1>Tak for din bestilling</h1>
        <p>
          Din betaling er gennemført. Spørg personalet, hvis din bestilling ikke
          kommer.
        </p>
      </div>
    </div>
  );
}
