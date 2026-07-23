"use client";

import { useMemo, useState } from "react";
import "./booking.css";

type Ticket = {
  id: string;
  category: string;
  price: number;
  fee: number;
  maxCount: number;
};

type AddOn = {
  id: string;
  name: string;
  price: number;
  category: string;
};

type EventInfo = {
  title: string;
  date: string;
  time: string;
  duration: string;
  notes: string;
};

function kr(n: number) {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 0 }) + " kr.";
}

export default function BookingClient({
  event,
  tickets,
  addons,
}: {
  event: EventInfo;
  tickets: Ticket[];
  addons: AddOn[];
}) {
  const [ticketQty, setTicketQty] = useState<Record<string, number>>({});
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({
    name: "",
    company: "",
    address: "",
    zip: "",
    phone: "",
    email: "",
  });
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupedAddons = useMemo(() => {
    const map = new Map<string, AddOn[]>();
    for (const a of addons) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return Array.from(map.entries());
  }, [addons]);

  const totalTickets = Object.values(ticketQty).reduce((a, b) => a + b, 0);

  const total = useMemo(() => {
    let sum = 0;
    for (const t of tickets) sum += (ticketQty[t.id] || 0) * (t.price + t.fee);
    for (const a of addons) sum += (addonQty[a.id] || 0) * a.price;
    return sum;
  }, [tickets, addons, ticketQty, addonQty]);

  function setTicket(id: string, delta: number, max: number) {
    setTicketQty((prev) => {
      const next = Math.max(0, Math.min(max, (prev[id] || 0) + delta));
      return { ...prev, [id]: next };
    });
  }

  function setAddon(id: string, delta: number) {
    setAddonQty((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      return { ...prev, [id]: next };
    });
  }

  async function submit() {
    setError(null);
    if (totalTickets === 0) {
      setError("Vælg mindst én billet.");
      return;
    }
    if (!customer.name || (!customer.phone && !customer.email)) {
      setError("Udfyld navn samt telefon eller email.");
      return;
    }
    setSubmitting(true);
    try {
      const lineItems = [
        ...tickets
          .filter((t) => ticketQty[t.id])
          .map((t) => ({
            name: `Billet: ${t.category}`,
            unitAmount: t.price + t.fee,
            quantity: ticketQty[t.id],
          })),
        ...addons
          .filter((a) => addonQty[a.id])
          .map((a) => ({
            name: a.name,
            unitAmount: a.price,
            quantity: addonQty[a.id],
          })),
      ];

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          ticketCount: totalTickets,
          specialRequests,
          lineItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Noget gik galt");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt");
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="hero ticket-edge">
        <div>
          <div className="eyebrow" style={{ color: "var(--bh-gold)" }}>
            Bakkens Hvile · Underholdning siden 1877
          </div>
          <h1 className="hero-title">{event.title}</h1>
          <div className="hero-meta">
            <span>
              <b>Dato</b> {event.date}
            </span>
            <span>
              <b>Kl.</b> {event.time}
            </span>
            <span>
              <b>Varighed</b> {event.duration}
            </span>
          </div>
        </div>
        <div className="hero-stub">
          <div className="mono">BILLET</div>
          <div className="stub-since">Nr. 150</div>
        </div>
      </div>
      {event.notes && <div className="notice">{event.notes}</div>}

      <div className="section">
        <div className="section-title">Vælg billetter</div>
        <div className="section-sub">Alle priser er inkl. moms og gebyr</div>
        {tickets.map((t) => (
          <div className="ticket-row" key={t.id}>
            <div className="ticket-name">{t.category}</div>
            <div className="ticket-price">{kr(t.price + t.fee)}</div>
            <div className="stepper">
              <button
                onClick={() => setTicket(t.id, -1, t.maxCount)}
                disabled={!ticketQty[t.id]}
                aria-label={`Fjern ${t.category}`}
              >
                −
              </button>
              <span>{ticketQty[t.id] || 0}</span>
              <button
                onClick={() => setTicket(t.id, 1, t.maxCount)}
                aria-label={`Tilføj ${t.category}`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {groupedAddons.length > 0 && (
        <div className="section">
          <div className="section-title">Tilvalg</div>
          <div className="section-sub">Drikkevarer og snacks til bordet</div>
          <div className="addon-groups">
            {groupedAddons.map(([category, items]) => (
              <div className="addon-group" key={category}>
                <h4>{category}</h4>
                {items.map((a) => (
                  <div className="addon-item" key={a.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!addonQty[a.id]}
                        onChange={() =>
                          setAddon(a.id, addonQty[a.id] ? -addonQty[a.id] : 1)
                        }
                      />
                      {a.name}
                    </label>
                    <span className="addon-price">{kr(a.price)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">Dine oplysninger</div>
        <div className="form-grid">
          <div className="field">
            <label>Fornavn og efternavn *</label>
            <input
              value={customer.name}
              onChange={(e) =>
                setCustomer({ ...customer, name: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Firmanavn</label>
            <input
              value={customer.company}
              onChange={(e) =>
                setCustomer({ ...customer, company: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Telefon *</label>
            <input
              value={customer.phone}
              onChange={(e) =>
                setCustomer({ ...customer, phone: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Email *</label>
            <input
              value={customer.email}
              onChange={(e) =>
                setCustomer({ ...customer, email: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Adresse</label>
            <input
              value={customer.address}
              onChange={(e) =>
                setCustomer({ ...customer, address: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Postnr.</label>
            <input
              value={customer.zip}
              onChange={(e) =>
                setCustomer({ ...customer, zip: e.target.value })
              }
            />
          </div>
          <div className="field full">
            <label>Særlige ønsker (maks. 100 tegn)</label>
            <textarea
              maxLength={100}
              rows={2}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
      </div>

      <div className="summary">
        <div>
          <div className="summary-total">{kr(total)}</div>
          <div className="summary-count">
            {totalTickets} billet{totalTickets === 1 ? "" : "ter"}
          </div>
        </div>
        <button
          className="submit-btn"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? "Sender..." : "Gå til betaling"}
        </button>
      </div>
    </div>
  );
}
