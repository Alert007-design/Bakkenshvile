import { parseTableNumber } from "@/lib/tables";
import { verifyTableToken } from "@/lib/table-tokens";
import { isOrderingEnabled } from "@/lib/table-ordering-config";
import { getDb } from "@/lib/db";
import { getActiveEvent } from "@/lib/hall-state";
import { getMenuGroups } from "@/lib/menu";
import BordClient from "./BordClient";
import "../bord.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Skjult side: ingen indeksering.
export const metadata = { robots: { index: false, follow: false } };

function Message({
  tableNo,
  title,
  body,
}: {
  tableNo?: number;
  title: string;
  body: string;
}) {
  return (
    <div className="bord">
      <div className="bord-msg">
        {tableNo ? <div className="bord-no">{tableNo}</div> : null}
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </div>
  );
}

export default async function BordPage({
  params,
  searchParams,
}: {
  params: { nummer: string };
  searchParams: { k?: string };
}) {
  const table = parseTableNumber(params.nummer);
  const token = searchParams.k;

  // Ugyldigt bord eller token → samme generiske besked (afslører intet).
  if (!table || !verifyTableToken(table.number, token)) {
    return (
      <Message
        title="Hov"
        body="Scan koden på bordet igen."
      />
    );
  }

  if (!isOrderingEnabled()) {
    return (
      <Message
        tableNo={table.number}
        title={`Bord ${table.number}`}
        body="Bordbestilling åbner snart. Spørg endelig en tjener imens."
      />
    );
  }

  // Aftenens aktive forestilling udledes serverside.
  let activeEventId: string | null = null;
  let showState = "before_show";
  try {
    const active = await getActiveEvent(getDb());
    activeEventId = active?.eventId ?? null;
    showState = active?.state ?? "closed";
  } catch {
    activeEventId = null;
  }

  if (!activeEventId) {
    return (
      <Message
        tableNo={table.number}
        title={`Bord ${table.number}`}
        body="Der er ikke åbnet for bestilling lige nu. Vinket efter en tjener virker altid."
      />
    );
  }

  const menuGroups = await getMenuGroups();

  return (
    <BordClient
      tableNumber={table.number}
      row={table.row}
      position={table.position}
      token={token!}
      eventId={activeEventId}
      isShow={showState === "show"}
      menuGroups={menuGroups}
    />
  );
}
