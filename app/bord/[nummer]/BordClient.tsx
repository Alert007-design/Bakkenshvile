"use client";

import { useMemo, useState } from "react";
import { formatKroner } from "@/lib/money";
import type { MenuGroup } from "@/lib/menu";
import { MAX_PER_ITEM } from "@/lib/table-ordering-config";

export default function BordClient({
  tableNumber,
  row,
  position,
  token,
  eventId,
  isShow,
  menuGroups,
}: {
  tableNumber: number;
  row: number;
  position: number;
  token: string;
  eventId: string;
  isShow: boolean;
  menuGroups: MenuGroup[];
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [guestName, setGuestName] = useState("");
  const [message, setMessage] = useState("");
  const [deliverInInterval, setDeliverInInterval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemById = useMemo(() => {
    const m = new Map<string, MenuGroup["items"][number]>();
    for (const g of menuGroups) for (const it of g.items) m.set(it.id, it);
    return m;
  }, [menuGroups]);

  const { totalOre, totalCount } = useMemo(() => {
    let totalOre = 0;
    let totalCount = 0;
    for (const [id, n] of Object.entries(qty)) {
      const item = itemById.get(id);
      if (item && n > 0) {
        // Bestilling ved bordet/via QR sker altid til fuld pris.
        totalOre += item.unitPriceOre * n;
        totalCount += n;
      }
    }
    return { totalOre, totalCount };
  }, [qty, itemById]);

  function setItemQty(id: string, next: number) {
    setQty((prev) => {
      const clamped = Math.max(0, Math.min(MAX_PER_ITEM, next));
      const copy = { ...prev };
      if (clamped === 0) delete copy[id];
      else copy[id] = clamped;
      return copy;
    });
  }

  async function pay() {
    setError(null);
    if (totalCount === 0) return;
    if (!guestName.trim()) {
      setError("Skriv et navn, så vi ved hvem bestillingen er til.");
      return;
    }
    setSubmitting(true);
    try {
      const items = Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
      const res = await fetch("/api/table-orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber,
          tableToken: token,
          eventId,
          guestName: guestName.trim(),
          message: message.trim() || undefined,
          requestedDeliveryPhase: deliverInInterval ? "interval" : "now",
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Noget gik galt. Prøv igen.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Kunne ikke oprette bestillingen. Tjek forbindelsen og prøv igen.");
      setSubmitting(false);
    }
  }

  return (
    <div className="bord" data-show={isShow ? "true" : "false"}>
      <div className="bord-head">
        <div className="bord-no">{tableNumber}</div>
        <div className="bord-place">
          {row}. række · {position}. bord fra baren
        </div>
        <div className="bord-note">
          Priserne her er de almindelige priser. Onlinerabatten på 10% gælder
          kun drikkevarer forudbestilt sammen med billetten, senest kl. 12.00 på
          forestillingsdagen.
        </div>
        {isShow ? (
          <div className="bord-note">
            Forestillingen er i gang, så skærmen er dæmpet. Du kan roligt bestille nu —
            eller vent til pausen, så forstyrrer vi ikke under sangene.
          </div>
        ) : null}
      </div>

      <div className="menu">
        {menuGroups.map((g) => (
          <section key={g.group}>
            <h2 className="menu-group-title">{g.group}</h2>
            {g.items.map((item) => {
              const n = qty[item.id] ?? 0;
              return (
                <div className="menu-item" key={item.id}>
                  <div className="menu-item-main">
                    <div className="menu-item-name">{item.name}</div>
                    {item.description ? (
                      <div className="menu-item-desc">{item.description}</div>
                    ) : null}
                    <div className="menu-item-price">
                      {formatKroner(item.unitPriceOre)}
                    </div>
                  </div>
                  <div className="qty">
                    <button
                      type="button"
                      aria-label={`Færre ${item.name}`}
                      onClick={() => setItemQty(item.id, n - 1)}
                      disabled={n === 0}
                    >
                      −
                    </button>
                    <span className="qty-val" aria-live="polite">
                      {n}
                    </span>
                    <button
                      type="button"
                      aria-label={`Flere ${item.name}`}
                      onClick={() => setItemQty(item.id, n + 1)}
                      disabled={n >= MAX_PER_ITEM}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="field">
        <label htmlFor="guestName">Navn ved bordet</label>
        <input
          id="guestName"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Fornavn eller kaldenavn"
          maxLength={60}
          autoComplete="given-name"
        />
      </div>
      <div className="field">
        <label htmlFor="msg">Besked til baren (valgfri)</label>
        <textarea
          id="msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Fx uden is, ekstra glas ..."
          maxLength={280}
          rows={2}
        />
      </div>
      {isShow ? (
        <div className="field">
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={deliverInInterval}
              onChange={(e) => setDeliverInInterval(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Vent til pausen — så forstyrrer vi ikke under sangene
          </label>
        </div>
      ) : null}

      {error ? <p className="error-line">{error}</p> : null}

      <div className="checkout-bar">
        <div className="checkout-bar-inner">
          <div className="checkout-total">
            <div className="n">
              {totalCount} {totalCount === 1 ? "vare" : "varer"}
            </div>
            <div className="amt">{formatKroner(totalOre)}</div>
          </div>
          <button
            className="btn-pay"
            onClick={pay}
            disabled={submitting || totalCount === 0}
          >
            {submitting ? "Et øjeblik ..." : "Til betaling"}
          </button>
        </div>
      </div>
    </div>
  );
}
