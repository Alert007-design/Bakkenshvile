"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addonsTotalDiscountKr,
  discountedAddonUnitKr,
  ADDON_DISCOUNT_LABEL,
} from "@/lib/pricing";
import "./booking.css";

type AddOn = {
  id: string;
  name: string;
  price: number;
  category: string;
};

type BookingView = {
  bookingNo: string;
  name: string;
  showTitle: string;
  showDate: string;
  showTime: string;
  ticketCount: number;
  ticketBreakdown: string;
  existingAddons: string;
  deadlinePassed: boolean;
};

type Creds =
  | { ref: string; key: string }
  | { bookingNo: string; email: string };

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

const GENERIC_ERROR =
  "Vi kunne ikke finde en booking, der matcher. Tjek oplysningerne og prøv igen.";

export default function GenbestilClient({
  addons,
  initialRef,
  initialKey,
}: {
  addons: AddOn[];
  initialRef: string;
  initialKey: string;
}) {
  const [booking, setBooking] = useState<BookingView | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ bookingNo: "", email: "" });
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  async function lookup(payload: Creds) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/genbestil/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || GENERIC_ERROR);
      setBooking(data.booking as BookingView);
      setCreds(payload);
    } catch (e) {
      setBooking(null);
      setCreds(null);
      setError(e instanceof Error ? e.message : GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  // Auto-login hvis linket indeholder gyldige ref+nøgle.
  useEffect(() => {
    if (initialRef && initialKey) {
      lookup({ ref: initialRef, key: initialKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRef, initialKey]);

  const groupedAddons = useMemo(() => {
    const map = new Map<string, AddOn[]>();
    for (const a of addons) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return Array.from(map.entries());
  }, [addons]);

  const addonSubtotal = useMemo(() => {
    let sum = 0;
    for (const a of addons) sum += (addonQty[a.id] || 0) * a.price;
    return sum;
  }, [addons, addonQty]);

  const discount = useMemo(
    () =>
      addonsTotalDiscountKr(
        addons
          .filter((a) => addonQty[a.id])
          .map((a) => ({ unitKr: a.price, quantity: addonQty[a.id] }))
      ),
    [addons, addonQty]
  );

  const total = addonSubtotal - discount;
  const totalItems = Object.values(addonQty).reduce((a, b) => a + b, 0);

  function setAddon(id: string, delta: number) {
    setAddonQty((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      return { ...prev, [id]: next };
    });
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bookingNo.trim() || !form.email.trim()) {
      setError("Udfyld både bestillingsnummer og email.");
      return;
    }
    await lookup({ bookingNo: form.bookingNo.trim(), email: form.email.trim() });
  }

  async function pay() {
    if (!creds) return;
    if (totalItems === 0) {
      setError("Vælg mindst én drikkevare.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/genbestil/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...creds, addonQty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Noget gik galt");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt");
      setSubmitting(false);
    }
  }

  // --- Ikke logget ind: login-formular ---
  if (!booking) {
    return (
      <div className="page">
        <div className="book-hero">
          <div className="eyebrow">Bakkens Hvile · Genbestilling</div>
          <h1 className="jubilee-title">Bestil flere drikkevarer</h1>
          <p className="book-helper">
            Log ind med dit bestillingsnummer og den email, du bestilte med, så
            kan du tilføje drikkevarer til din booking.
          </p>
        </div>

        <div className="section">
          <form className="form-grid" onSubmit={submitLogin}>
            <div className="field">
              <label htmlFor="gb-no">Bestillingsnummer</label>
              <input
                id="gb-no"
                placeholder="fx BH-12345678"
                value={form.bookingNo}
                onChange={(e) =>
                  setForm({ ...form, bookingNo: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="gb-email">Email</label>
              <input
                id="gb-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field full">
              <button
                className="submit-btn"
                type="submit"
                disabled={loading}
              >
                {loading ? "Søger..." : "Log ind"}
              </button>
            </div>
          </form>
          {error && (
            <div className="error-msg" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  const existingAddonLines = booking.existingAddons
    ? booking.existingAddons.split("\n").filter(Boolean)
    : [];

  // --- Logget ind: booking-oversigt ---
  return (
    <div className="page">
      <div className="book-hero book-hero--compact">
        <div className="eyebrow">Bakkens Hvile · Genbestilling</div>
        <h1
          className="jubilee-title"
          style={{ fontSize: "clamp(26px, 4vw, 38px)" }}
        >
          Hej {booking.name || "gæst"}
        </h1>
        <div className="hero-meta">
          <span>
            <b>Show</b> {booking.showTitle || "—"}
          </span>
          <span>
            <b>Dato</b> {formatShortDate(booking.showDate)}
          </span>
          <span>
            <b>Kl.</b> {booking.showTime}
          </span>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Din nuværende bestilling</div>
        <div className="section-sub">Bestillingsnr. {booking.bookingNo}</div>
        <div className="notice">
          <div>
            <b>Billetter:</b>{" "}
            {booking.ticketBreakdown ||
              `${booking.ticketCount} billet${
                booking.ticketCount === 1 ? "" : "ter"
              }`}
          </div>
          <div style={{ marginTop: 6 }}>
            <b>Drikkevarer:</b>{" "}
            {existingAddonLines.length > 0
              ? existingAddonLines.join(", ")
              : "Ingen endnu"}
          </div>
        </div>
      </div>

      {booking.deadlinePassed ? (
        <div className="section">
          <div className="notice" role="status">
            Genbestilling er lukket for denne dato. Drikkevarer kan bestilles
            ved bordet hos tjenerne — vi ses til showet!
          </div>
        </div>
      ) : (
        <>
          <div className="section">
            <div className="section-title">Tilføj drikkevarer</div>
            <div className="section-sub">
              Alle priser er inkl. moms — 10% onlinerabat er trukket fra
            </div>
            <div className="addon-groups">
              {groupedAddons.map(([category, items]) => (
                <div className="addon-group" key={category}>
                  <h4>{category}</h4>
                  {items.map((a) => (
                    <div className="addon-item" key={a.id}>
                      <span className="addon-name">{a.name}</span>
                      <div className="addon-controls">
                        <span className="addon-price">
                          <span className="addon-price-full">{kr(a.price)}</span>{" "}
                          <span className="addon-price-discounted">
                            {kr(discountedAddonUnitKr(a.price))}
                          </span>
                        </span>
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
            {error && (
              <div className="error-msg" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="summary">
            <div>
              {discount > 0 && (
                <>
                  <div className="summary-line">
                    <span>Subtotal</span>
                    <span>{kr(addonSubtotal)}</span>
                  </div>
                  <div className="summary-discount">
                    <span>{ADDON_DISCOUNT_LABEL}</span>
                    <span className="summary-discount-amount">
                      −{kr(discount)}
                    </span>
                  </div>
                </>
              )}
              <div className="summary-total">{kr(total)}</div>
              <div className="summary-count">
                {totalItems} vare{totalItems === 1 ? "" : "r"}
              </div>
            </div>
            <button
              className="submit-btn"
              onClick={pay}
              disabled={submitting || totalItems === 0}
            >
              {submitting ? "Sender..." : "Gå til betaling"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
