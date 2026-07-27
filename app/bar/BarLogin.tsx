"use client";

import { useState } from "react";

export default function BarLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bar/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Genindlæs — serverkomponenten viser nu skærmen.
        window.location.reload();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(res.status === 429 ? "For mange forsøg. Vent lidt." : data.error || "Forkert kode.");
    } catch {
      setError("Kunne ikke logge ind. Tjek forbindelsen.");
    }
    setBusy(false);
  }

  return (
    <div className="bar-login">
      <form onSubmit={submit} className="bar-login-box">
        <h1>Bakkens Hvile · Baren</h1>
        <label htmlFor="pw">Adgangskode</label>
        <input
          id="pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />
        {error ? <p className="bar-login-error">{error}</p> : null}
        <button type="submit" disabled={busy || !password}>
          {busy ? "Logger ind …" : "Log ind"}
        </button>
      </form>
    </div>
  );
}
