"use client";

import { useEffect, useState } from "react";
import { formatKroner } from "@/lib/money";

interface OrderView {
  orderNumber: string;
  tableNumber: number;
  totalOre: number;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  fulfillmentStatus: "new" | "preparing" | "ready" | "delivered" | "cancelled";
  lines: { name: string; quantity: number; unitPriceOre: number; lineTotalOre: number }[];
}

const PAYMENT_TEXT: Record<OrderView["paymentStatus"], string> = {
  pending: "Betalingen behandles",
  paid: "Betalt – ordren er modtaget",
  failed: "Betalingen kunne ikke gennemføres",
  refunded: "Beløbet er refunderet",
};

const FULFILLMENT_TEXT: Record<OrderView["fulfillmentStatus"], string> = {
  new: "Baren har set din bestilling",
  preparing: "Vi gør din bestilling klar",
  ready: "Klar – på vej til bordet",
  delivered: "Leveret. Velbekomme!",
  cancelled: "Bestillingen er annulleret",
};

export default function KvitteringClient({
  tableNumber,
  publicToken,
}: {
  tableNumber: number;
  publicToken: string;
}) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(publicToken)}`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (alive) setNotFound(true);
          return;
        }
        if (res.ok && alive) {
          setOrder(await res.json());
        }
      } catch {
        /* prøv igen ved næste interval */
      }
      // Poll hvert 9. sekund indtil leveret/annulleret.
      if (alive) timer = setTimeout(poll, 9000);
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [publicToken]);

  const badgeClass =
    order?.paymentStatus === "paid"
      ? "paid"
      : order?.paymentStatus === "failed"
        ? "failed"
        : "processing";

  return (
    <div className="bord">
      <div className="kvit">
        <div className="bord-no">{tableNumber}</div>
        {notFound ? (
          <p>Vi kunne ikke finde din ordre. Spørg en tjener, hvis noget driller.</p>
        ) : !order ? (
          <p className="kvit-status">Henter din ordre …</p>
        ) : (
          <>
            <p className="kvit-status">{PAYMENT_TEXT[order.paymentStatus]}</p>
            <span className={`kvit-badge ${badgeClass}`}>
              {order.paymentStatus === "paid"
                ? FULFILLMENT_TEXT[order.fulfillmentStatus]
                : PAYMENT_TEXT[order.paymentStatus]}
            </span>
            <p style={{ color: "var(--muted)", marginTop: 16 }}>
              Ordrenr. {order.orderNumber}
            </p>
            <div className="kvit-lines">
              {order.lines.map((l, i) => (
                <div className="row" key={i}>
                  <span>
                    {l.quantity} × {l.name}
                  </span>
                  <span>{formatKroner(l.lineTotalOre)}</span>
                </div>
              ))}
              <div className="row" style={{ fontWeight: 700 }}>
                <span>I alt</span>
                <span>{formatKroner(order.totalOre)}</span>
              </div>
            </div>
            {order.paymentStatus === "pending" ? (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                Du kan roligt lukke siden — din ordre er registreret, når betalingen er
                bekræftet.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
