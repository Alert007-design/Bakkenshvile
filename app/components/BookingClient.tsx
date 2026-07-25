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

type ShowStatus = "few" | "soldout" | "premiere";

type ShowDate = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  notes: string;
  // Valgfrit felt — findes ikke i Airtable/page.tsx endnu.
  // Tilføj et "Status"-felt i Events-tabellen (fx single-select med
  // værdierne "few" / "soldout" / "premiere") og send det med fra
  // page.tsx, så virker badges "Få pladser" og "Udsolgt" automatisk.
  status?: ShowStatus;
};

function kr(n: number) {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 0 }) + " kr.";
}

const WEEKDAYS = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

function formatShortDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function monthLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getBadge(
  show: ShowDate,
  isEarliest: boolean
): { type: ShowStatus; label: string } | null {
  if (show.status === "soldout") return { type: "soldout", label: "Udsolgt" };
  if (show.status === "few") return { type: "few", label: "Få pladser" };
  if (show.status === "premiere" || isEarliest)
    return { type: "premiere", label: "Premiere" };
  return null;
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Dato", "Billetter", "Betaling"];
  return (
    <div className="step-indicator" role="list" aria-label="Bestillingstrin">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const state =
          stepNum < current ? "done" : stepNum === current ? "active" : "upcoming";
        return (
          <div
            className="step"
            role="listitem"
            key={label}
            aria-current={state === "active" ? "step" : undefined}
          >
            <span className={`step-dot step-${state}`}>
              {state === "done" ? "✓" : stepNum}
            </span>
            <span className={`step-label step-label-${state}`}>{label}</span>
            {stepNum < steps.length && (
              <span className="step-connector" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingClient({
  showDates,
  tickets,
  addons,
}: {
  showDates: ShowDate[];
  tickets: Ticket[];
  addons: AddOn[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [wantsMatching, setWantsMatching] = useState(false);
  const [matching, setMatching] = useState({
    ageGroup: "",
    location: "",
    interests: "",
    drinkPreference: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShow = showDates.find((s) => s.id === selectedId) ?? null;

  const earliestId = useMemo(() => {
    if (showDates.length === 0) return null;
    return [...showDates].sort((a, b) => a.date.localeCompare(b.date))[0].id;
  }, [showDates]);

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, ShowDate[]>();
    for (const s of showDates) {
      const key = monthLabel(s.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [showDates]);

  const groupedAddons = useMemo(() => {
    const map = new Map<string, AddOn[]>();
    for (const a of addons) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return Array.from(map.entries());
  }, [addons]);

  const sortedTickets = useMemo(() => {
    return [...tickets].sort(
      (a, b) => b.price + b.fee - (a.price + a.fee)
    );
  }, [tickets]);

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
    if (!selectedShow) {
      setError("Vælg en dato.");
      return;
    }
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
      const showLabel = `${formatShortDate(selectedShow.date)} kl. ${selectedShow.time}`;
      const lineItems = [
        ...tickets
          .filter((t) => ticketQty[t.id])
          .map((t) => ({
            name: `Billet: ${t.category} — ${showLabel}`,
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
          specialRequests: `Show: ${showLabel}${
            specialRequests ? " — " + specialRequests : ""
          }`,
          lineItems,
          showId: selectedShow.id,
          matching: wantsMatching ? { wantsMatching, ...matching } : undefined,
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

  if (!selectedShow) {
    return (
      <div className="page">
        <div className="book-hero">
          <div className="eyebrow">Bakkens Hvile · Underholdning siden 1877</div>
          <h1 className="jubilee-title">150 års jubilæumsshow</h1>
          <p className="book-helper">
            Vælg den forestilling, du ønsker at bestille billetter til.
          </p>
          <StepIndicator current={1} />
        </div>

        <div className="date-picker-panel">
          {groupedByMonth.map(([month, shows]) => (
            <div className="date-picker-month" key={month}>
              <div className="date-picker-month-title">{month}</div>
              <div className="date-picker-grid">
                {shows.map((s) => {
                  const badge = getBadge(s, s.id === earliestId);
                  const isSoldOut = badge?.type === "soldout";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`date-picker-btn${
                        isSoldOut ? " is-soldout" : ""
                      }`}
                      onClick={() => !isSoldOut && setSelectedId(s.id)}
                      disabled={isSoldOut}
                      aria-label={`${formatShortDate(s.date)} kl. ${s.time}${
                        badge ? ", " + badge.label : ""
                      }`}
                    >
                      {badge && (
                        <span className={`date-picker-badge badge-${badge.type}`}>
                          {badge.label}
                        </span>
                      )}
                      <span className="date-picker-day">
                        {formatShortDate(s.date)}
                      </span>
                      <span className="date-picker-time">kl. {s.time}</span>
                      {!isSoldOut && (
                        <span className="date-picker-go" aria-hidden="true">
                          Vælg →
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="book-hero book-hero--compact">
        <div className="eyebrow">Bakkens Hvile · Underholdning siden 1877</div>
        <h1 className="jubilee-title" style={{ fontSize: "clamp(26px, 4vw, 38px)" }}>
          {selectedShow.title}
        </h1>
        <div className="hero-meta">
          <span>
            <b>Dato</b> {formatShortDate(selectedShow.date)}
          </span>
          <span>
            <b>Kl.</b> {selectedShow.time}
          </span>
          <span>
            <b>Varighed</b> {selectedShow.duration}
          </span>
        </div>
        <StepIndicator current={2} />
        <button
          className="change-date-link"
          onClick={() => setSelectedId(null)}
        >
          Skift dato
        </button>
      </div>
      {selectedShow.notes && <div className="notice">{selectedShow.notes}</div>}

      <div className="section">
        <div className="section-title">Vælg billetter</div>
        <div className="section-sub">Alle priser er inkl. moms og gebyr</div>
        {sortedTickets.map((t) => (
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
                    <span className="addon-name">{a.name}</span>
                    <div className="addon-controls">
                      <span className="addon-price">{kr(a.price)}</span>
                      <div className="stepper">
                        <button
                          onClick={() => setAddon(a.id, -1)}
                          disabled={!addonQty[a.id]}
                          aria-label={`Fjern ${a.name}`}
                        >
                          −
                        </button>
                        <span>{addonQty[a.id] || 0}</span>
                        <button
                          onClick={() => setAddon(a.id, 1)}
                          aria-label={`Tilføj ${a.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
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
            <label htmlFor="cust-name">Fornavn og efternavn *</label>
            <input
              id="cust-name"
              value={customer.name}
              onChange={(e) =>
                setCustomer({ ...customer, name: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cust-company">Firmanavn</label>
            <input
              id="cust-company"
              value={customer.company}
              onChange={(e) =>
                setCustomer({ ...customer, company: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cust-phone">Telefon *</label>
            <input
              id="cust-phone"
              value={customer.phone}
              onChange={(e) =>
                setCustomer({ ...customer, phone: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cust-email">Email *</label>
            <input
              id="cust-email"
              value={customer.email}
              onChange={(e) =>
                setCustomer({ ...customer, email: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cust-address">Adresse</label>
            <input
              id="cust-address"
              value={customer.address}
              onChange={(e) =>
                setCustomer({ ...customer, address: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cust-zip">Postnr.</label>
            <input
              id="cust-zip"
              value={customer.zip}
              onChange={(e) =>
                setCustomer({ ...customer, zip: e.target.value })
              }
            />
          </div>
          <div className="field full">
            <label htmlFor="cust-notes">Særlige ønsker (maks. 100 tegn)</label>
            <textarea
              id="cust-notes"
              maxLength={100}
              rows={2}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <div className="error-msg" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">Om bordplaceringen</div>
        <div className="section-sub">
          Ved udsolgte shows sættes gæster ved borde inden for den
          billetkategori, I har købt. Bordene i salen rummer 5-6 personer, og
          jeres selskab kan derfor komme til at dele bord med andre gæster.
          Vi opfordrer jer til at udfylde spørgsmålene herunder — de hjælper
          os med at sætte selskaber sammen, der passer godt til hinanden.
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 14,
            marginBottom: wantsMatching ? 20 : 0,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={wantsMatching}
            onChange={(e) => setWantsMatching(e.target.checked)}
          />
          Ja, vi vil gerne udfylde et par ting, der kan hjælpe med
          bordplaceringen
        </label>
        {wantsMatching && (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="match-age">Aldersgruppe</label>
              <select
                id="match-age"
                value={matching.ageGroup}
                onChange={(e) =>
                  setMatching({ ...matching, ageGroup: e.target.value })
                }
              >
                <option value="">Vælg...</option>
                <option value="18-25">18-25</option>
                <option value="26-35">26-35</option>
                <option value="36-50">36-50</option>
                <option value="51-65">51-65</option>
                <option value="65+">65+</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="match-location">Hvor er I fra?</label>
              <input
                id="match-location"
                placeholder="fx København"
                value={matching.location}
                onChange={(e) =>
                  setMatching({ ...matching, location: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="match-drink">Foretrukken drik</label>
              <select
                id="match-drink"
                value={matching.drinkPreference}
                onChange={(e) =>
                  setMatching({ ...matching, drinkPreference: e.target.value })
                }
              >
                <option value="">Vælg...</option>
                <option value="Vin">Vin</option>
                <option value="Øl">Øl</option>
                <option value="Cocktails/drinks">Cocktails/drinks</option>
                <option value="Alkoholfrit">Alkoholfrit</option>
                <option value="Bland selv">Bland selv</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="match-interests">Interesser</label>
              <input
                id="match-interests"
                placeholder="fx rejser, mad, musik"
                value={matching.interests}
                onChange={(e) =>
                  setMatching({ ...matching, interests: e.target.value })
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="match-note">
                Andet der kan hjælpe os med at sætte jer godt
              </label>
              <textarea
                id="match-note"
                rows={2}
                placeholder="Helt op til jer — fx hvem I gerne vil sidde sammen med"
                value={matching.note}
                onChange={(e) =>
                  setMatching({ ...matching, note: e.target.value })
                }
              />
            </div>
          </div>
        )}
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
