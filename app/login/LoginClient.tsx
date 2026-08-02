"use client";

import { useState } from "react";

export default function LoginClient({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Fuld navigation, så serverkomponenten på målsiden læser den nye cookie.
        window.location.href = next;
        return;
      }
      // Neutral fejlbesked (samme uanset årsag ud over throttling).
      setError(
        res.status === 429
          ? "For mange forsøg. Prøv igen om lidt."
          : "Forkert adgangskode."
      );
    } catch {
      setError("Kunne ikke logge ind. Tjek forbindelsen.");
    }
    setBusy(false);
  }

  return (
    <div className="staff-login">
      <form onSubmit={submit} className="staff-login-box" aria-labelledby="login-title">
        <p className="staff-login-eyebrow">Bakkens Hvile</p>
        <h1 id="login-title">Personale-login</h1>
        <p className="staff-login-sub">
          Fælles adgang til de interne funktioner. Log ind for at fortsætte.
        </p>
        <label htmlFor="staff-pw">Adgangskode</label>
        <input
          id="staff-pw"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          required
        />
        {error ? (
          <p className="staff-login-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || !password}>
          {busy ? "Logger ind …" : "Log ind"}
        </button>
      </form>
    </div>
  );
}
