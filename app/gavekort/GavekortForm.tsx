"use client";

import { useState } from "react";

// Klientformular til køb af gavekort. Sender kun beløb + kontaktoplysninger til
// serveren (aldrig en færdig pris). Ved svar { url } sendes gæsten til Vivas
// Smart Checkout. Validering her spejler serverens — serveren er autoritativ.
//
// Felterne bruger .bookField fra globals.css — samme klasse som booking-
// formularen. Tidligere satte filen sine egne inline-styles med tokens, der
// ikke findes (--bh-cream/--border), så baggrunden faldt tilbage til hvid,
// mens teksten arvede sidens næsten hvide --paper: hvid tekst på hvid bund.
// Genbrug af klassen giver baggrund, tekstfarve, placeholder og fokus-ring
// ét sted og holder formularen i sync med resten af sitet.

const MIN_KR = 100;
const MAX_KR = 5000;

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function GavekortForm() {
  const [amount, setAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [purchaserPhone, setPurchaserPhone] = useState("");
  const [message, setMessage] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): string | null {
    const kr = Number(amount);
    if (!Number.isInteger(kr) || kr < MIN_KR || kr > MAX_KR) {
      return `Beløbet skal være et helt kronebeløb mellem ${MIN_KR} og ${MAX_KR} kr.`;
    }
    if (!isEmail(recipientEmail)) return "Angiv en gyldig e-mail til modtageren.";
    if (!purchaserName.trim()) return "Angiv dit navn.";
    if (!isEmail(purchaserEmail)) return "Angiv din egen gyldige e-mail.";
    if (!acceptTerms) return "Du skal acceptere handelsbetingelserne.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/gavekort/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountKr: Number(amount),
          recipientEmail: recipientEmail.trim(),
          purchaserName: purchaserName.trim(),
          purchaserEmail: purchaserEmail.trim(),
          purchaserPhone: purchaserPhone.trim() || undefined,
          message: message.trim() || undefined,
          acceptTerms,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Noget gik galt. Prøv igen om lidt.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Kunne ikke oprette betalingen. Tjek din forbindelse og prøv igen.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ maxWidth: 520 }}>
      <div className="bookField">
        <label htmlFor="gk-amount">Beløb (hele kroner)</label>
        <input
          id="gk-amount"
          type="number"
          inputMode="numeric"
          min={MIN_KR}
          max={MAX_KR}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Fx 500 (mellem ${MIN_KR} og ${MAX_KR})`}
          required
        />
      </div>

      <div className="bookField" style={{ marginTop: 20 }}>
        <label htmlFor="gk-recipient">Modtagerens e-mail</label>
        <input
          id="gk-recipient"
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="Gavekortet sendes hertil"
          required
        />
      </div>

      <div className="bookField" style={{ marginTop: 20 }}>
        <label htmlFor="gk-name">Dit navn</label>
        <input
          id="gk-name"
          type="text"
          value={purchaserName}
          onChange={(e) => setPurchaserName(e.target.value)}
          required
        />
      </div>

      <div className="bookField" style={{ marginTop: 20 }}>
        <label htmlFor="gk-email">Din e-mail (kvittering)</label>
        <input
          id="gk-email"
          type="email"
          value={purchaserEmail}
          onChange={(e) => setPurchaserEmail(e.target.value)}
          required
        />
      </div>

      <div className="bookField" style={{ marginTop: 20 }}>
        <label htmlFor="gk-phone">Dit telefonnummer (valgfrit)</label>
        <input
          id="gk-phone"
          type="tel"
          value={purchaserPhone}
          onChange={(e) => setPurchaserPhone(e.target.value)}
        />
      </div>

      <div className="bookField" style={{ marginTop: 20 }}>
        <label htmlFor="gk-message">Hilsen til modtageren (valgfrit)</label>
        <textarea
          id="gk-message"
          style={{ minHeight: 80 }}
          maxLength={300}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Vises i gavekort-mailen"
        />
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "18px 0 0", fontSize: 14 }}>
        <input
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          Jeg accepterer{" "}
          <a href="/handelsbetingelser" target="_blank" rel="noopener noreferrer">
            handelsbetingelserne
          </a>
          . Gavekortet er gyldigt i 3 år og kan ikke ombyttes til kontanter.
        </span>
      </label>

      {error && (
        <p role="alert" style={{ color: "#b3261e", fontSize: 14, marginTop: 16 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        className="ctaGold"
        disabled={submitting}
        style={{ marginTop: 20, padding: "14px 28px", opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? "Sender dig til betaling …" : "Køb gavekort"}
      </button>
    </form>
  );
}
