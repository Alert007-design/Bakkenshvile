"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatOre } from "@/lib/money";
import { row as tableRow, position as tablePosition } from "@/lib/tables";

type Fulfillment = "new" | "preparing" | "ready" | "delivered" | "cancelled";

interface BarOrder {
  id: string;
  orderNumber: string;
  tableNumber: number;
  guestName: string;
  message: string | null;
  requestedDeliveryPhase: "now" | "interval";
  totalOre: number;
  fulfillmentStatus: Fulfillment;
  createdAt: string;
  lines: { name: string; quantity: number; unitPriceOre: number; lineTotalOre: number }[];
}

interface ActiveEvent {
  eventId: string;
  state: "before_show" | "show" | "interval" | "closed";
  orderingOpen: boolean;
}

interface EventOption {
  id: string;
  title: string;
  date: string;
  time: string;
}

// Næste status og knappens tekst i forløbet.
const NEXT: Partial<Record<Fulfillment, { to: Fulfillment; label: string }>> = {
  new: { to: "preparing", label: "Start" },
  preparing: { to: "ready", label: "Meld klar" },
  ready: { to: "delivered", label: "Leveret" },
};

function ageMinutes(createdAt: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 60000));
}

export default function BarClient({ csrf }: { csrf: string }) {
  const [orders, setOrders] = useState<BarOrder[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [sortMode, setSortMode] = useState<"time" | "route">("time");
  const [soundOn, setSoundOn] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [newFlash, setNewFlash] = useState<Set<string>>(new Set());

  const seenIds = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

  // Tik hvert 10. sek. så "alder på ordren" opdateres.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const playTone = useCallback(() => {
    if (!soundOn || !audioCtx.current) return;
    const ctx = audioCtx.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }, [soundOn]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/bar/orders", { cache: "no-store" });
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      const incoming: BarOrder[] = data.orders ?? [];

      // Nye ordrer siden sidst → lyd + visuel markering.
      const fresh = incoming.filter((o) => !seenIds.current.has(o.id));
      if (seenIds.current.size > 0 && fresh.length > 0) {
        playTone();
        setNewFlash((prev) => {
          const next = new Set(prev);
          fresh.forEach((o) => next.add(o.id));
          return next;
        });
        setTimeout(() => {
          setNewFlash((prev) => {
            const next = new Set(prev);
            fresh.forEach((o) => next.delete(o.id));
            return next;
          });
        }, 8000);
      }
      incoming.forEach((o) => seenIds.current.add(o.id));

      setOrders(incoming);
      setActiveEvent(data.activeEvent ?? null);
      setLastUpdated(Date.now());
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [playTone]);

  // Polling ca. hvert 3. sekund.
  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 3000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  // Hent forestillinger (til bekræftelse af aftenens event).
  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/bar/hall-state", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
        setActiveEvent(data.activeEvent ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function enableSound() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx.current = new Ctx();
      await audioCtx.current.resume();
      setSoundOn(true);
    } catch {
      setSoundOn(false);
    }
  }

  async function changeStatus(order: BarOrder, to: Fulfillment) {
    if (pendingId) return; // undgå dobbelt statusændring
    setPendingId(order.id);
    try {
      const res = await fetch(`/api/bar/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ toStatus: to }),
      });
      if (res.ok) await fetchOrders();
    } catch {
      /* næste polling retter op */
    } finally {
      setPendingId(null);
    }
  }

  async function setHall(action: "activate" | "state", eventId: string, state: ActiveEvent["state"]) {
    await fetch("/api/bar/hall-state", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ action: action === "activate" ? "activate" : "state", eventId, state }),
    });
    await Promise.all([fetchOrders(), loadEvents()]);
  }

  const sorted = useMemo(() => {
    const arr = [...orders];
    if (sortMode === "route") {
      arr.sort(
        (a, b) =>
          tableRow(a.tableNumber) - tableRow(b.tableNumber) ||
          tablePosition(a.tableNumber) - tablePosition(b.tableNumber)
      );
    } else {
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return arr;
  }, [orders, sortMode]);

  const isShow = activeEvent?.state === "show";
  const nowList = sorted.filter((o) => !isShow || o.requestedDeliveryPhase === "now");
  const intervalList = isShow ? sorted.filter((o) => o.requestedDeliveryPhase === "interval") : [];

  const openCount = orders.filter((o) => o.fulfillmentStatus !== "delivered").length;
  const waitingCount = orders.filter((o) => o.fulfillmentStatus === "new").length;
  const paidOre = orders.reduce((s, o) => s + o.totalOre, 0);

  function Card({ order }: { order: BarOrder }) {
    const next = NEXT[order.fulfillmentStatus];
    const flash = newFlash.has(order.id);
    return (
      <div className={`order-card status-${order.fulfillmentStatus}${flash ? " flash" : ""}`}>
        <div className="order-top">
          <div className="order-table">
            {order.tableNumber}
            <span className="order-place">
              rk {tableRow(order.tableNumber)} · pl {tablePosition(order.tableNumber)}
            </span>
          </div>
          <div className="order-meta">
            <div className="order-no">{order.orderNumber}</div>
            <div className="order-age">{ageMinutes(order.createdAt, nowMs)} min</div>
          </div>
        </div>
        <div className="order-guest">{order.guestName}</div>
        <ul className="order-lines">
          {order.lines.map((l, i) => (
            <li key={i}>
              <span className="q">{l.quantity}×</span> {l.name}
            </li>
          ))}
        </ul>
        {order.message ? <div className="order-msg">“{order.message}”</div> : null}
        <div className="order-bottom">
          <div className="order-total">{formatOre(order.totalOre)}</div>
          <div className="order-actions">
            {next ? (
              <button
                className="btn-status"
                disabled={pendingId === order.id}
                onClick={() => changeStatus(order, next.to)}
              >
                {next.label}
              </button>
            ) : null}
            {order.fulfillmentStatus !== "delivered" &&
            order.fulfillmentStatus !== "cancelled" ? (
              <button
                className="btn-cancel"
                disabled={pendingId === order.id}
                onClick={() => changeStatus(order, "cancelled")}
                aria-label="Annullér"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bar">
      <header className="bar-header">
        <div className="bar-title">Baren</div>
        <div className="bar-counters">
          <div className="counter">
            <span className="c-n">{openCount}</span>
            <span className="c-l">åbne</span>
          </div>
          <div className="counter">
            <span className="c-n">{waitingCount}</span>
            <span className="c-l">venter</span>
          </div>
          <div className="counter">
            <span className="c-n">{formatOre(paidOre)}</span>
            <span className="c-l">betalt salg</span>
          </div>
        </div>
        <div className="bar-controls">
          <button
            className={`toggle ${sortMode === "time" ? "on" : ""}`}
            onClick={() => setSortMode("time")}
          >
            Tid
          </button>
          <button
            className={`toggle ${sortMode === "route" ? "on" : ""}`}
            onClick={() => setSortMode("route")}
          >
            Rute
          </button>
          {soundOn ? (
            <button className="toggle on" onClick={() => setSoundOn(false)}>
              🔔 Lyd til
            </button>
          ) : (
            <button className="toggle" onClick={enableSound}>
              Aktivér lyd
            </button>
          )}
          <button className="toggle" onClick={fetchOrders}>
            Opdater
          </button>
        </div>
        <div className={`bar-status ${online ? "" : "offline"}`}>
          {online ? (
            <>
              Opdateret{" "}
              {lastUpdated
                ? new Date(lastUpdated).toLocaleTimeString("da-DK", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "…"}
            </>
          ) : (
            "⚠ Ingen forbindelse — viser sidste kendte ordrer"
          )}
        </div>
      </header>

      {/* Aftenens forestilling */}
      {!activeEvent ? (
        <div className="event-picker">
          <p>Bekræft aftenens forestilling for at åbne for bestilling:</p>
          <div className="event-list">
            {events.map((e) => (
              <button key={e.id} onClick={() => setHall("activate", e.id, "before_show")}>
                {e.title || "Forestilling"} · {e.date} {e.time}
              </button>
            ))}
            {events.length === 0 ? <span>Ingen forestillinger fundet.</span> : null}
          </div>
        </div>
      ) : (
        <div className="event-bar">
          <span>
            Aktiv:{" "}
            {["before_show", "show", "interval", "closed"].map((s) => (
              <button
                key={s}
                className={`state ${activeEvent.state === s ? "on" : ""}`}
                onClick={() => setHall("state", activeEvent.eventId, s as ActiveEvent["state"])}
              >
                {s === "before_show"
                  ? "Før show"
                  : s === "show"
                    ? "Show"
                    : s === "interval"
                      ? "Pause"
                      : "Lukket"}
              </button>
            ))}
          </span>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="bar-empty">Ingen bestillinger lige nu.</div>
      ) : isShow ? (
        <div className="bar-columns">
          <section>
            <h2 className="col-title">Skal laves nu</h2>
            <div className="order-grid">
              {nowList.map((o) => (
                <Card key={o.id} order={o} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="col-title">Leveres i pausen</h2>
            <div className="order-grid">
              {intervalList.map((o) => (
                <Card key={o.id} order={o} />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="order-grid">
          {sorted.map((o) => (
            <Card key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}
