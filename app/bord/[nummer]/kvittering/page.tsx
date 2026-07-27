import { parseTableNumber } from "@/lib/tables";
import KvitteringClient from "./KvitteringClient";
import "../../bord.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default function KvitteringPage({
  params,
  searchParams,
}: {
  params: { nummer: string };
  searchParams: { t?: string; session_id?: string };
}) {
  const table = parseTableNumber(params.nummer);
  const token = searchParams.t;

  if (!table || !token) {
    return (
      <div className="bord">
        <div className="bord-msg">
          <h1>Hov</h1>
          <p>Vi kunne ikke finde din ordre. Spørg en tjener, hvis noget driller.</p>
        </div>
      </div>
    );
  }

  return <KvitteringClient tableNumber={table.number} publicToken={token} />;
}
