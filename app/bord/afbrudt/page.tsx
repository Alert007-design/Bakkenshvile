// Vivas fælles failure-URL for bordbestilling (sat i Vivas dashboard). Viva
// hægter ?s, ?t og lang på, og ved gæstens annullering også ?cancel. Vi bruger
// kun ?cancel til at formulere beskeden — aldrig som adgang til en ordre.
//
// Er der en cookie (bh_bord_ordre) fra checkout, linker vi tilbage til netop
// gæstens bord; ellers til forsiden.

import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { getOrderForGuest } from "@/lib/orders";
import "../bord.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function VivaAfbrudtPage({
  searchParams,
}: {
  searchParams: { cancel?: string };
}) {
  const cancelled = searchParams.cancel !== undefined;

  // Prøv at finde bordet, så linket peger direkte tilbage til gæstens menu.
  let backHref = "/";
  const token = cookies().get("bh_bord_ordre")?.value;
  if (token) {
    const order = await getOrderForGuest(getDb(), token);
    if (order) backHref = `/bord/${order.tableNumber}`;
  }

  return (
    <div className="bord">
      <div className="bord-msg">
        <h1>{cancelled ? "Betalingen blev afbrudt" : "Betalingen gik ikke igennem"}</h1>
        <p>
          {cancelled
            ? "Du afbrød betalingen, så der er ikke trukket noget. Du kan prøve igen."
            : "Betalingen kunne ikke gennemføres, og der er ikke trukket noget. Prøv igen."}
        </p>
        <p>
          <a className="bord-link" href={backHref}>
            Tilbage til bordet
          </a>
        </p>
      </div>
    </div>
  );
}
