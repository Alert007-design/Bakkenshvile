"use client";

// Knap til at lægge dagens story op med det samme. Spørger først, og viser
// derefter, hvad der skete på hver platform.

import { useState } from "react";

const STATUS: Record<string, string> = {
  lagt: "lagt op",
  kladde: "kun kladde (ikke godkendt eller ikke live)",
  findes: "allerede lagt op i dag (eller venter)",
  venter: "venter på, at Instagram bliver færdig (udgives automatisk ved næste timekørsel)",
  fejl: "fejl",
};

export default function LaegOpNu({ slot, csrf, label }: { slot: string; csrf: string; label: string }) {
  const [svar, setSvar] = useState("");
  const [travl, setTravl] = useState(false);

  async function koer() {
    if (
      !window.confirm(
        `${label}? Den lægges op på Facebook og Instagram med det samme. Står Instagram som fejl i dag, prøves Instagram igen. Det, der allerede er lagt op, røres ikke.`
      )
    )
      return;
    setTravl(true);
    setSvar("");
    try {
      const r = await fetch("/api/admin/stories/koer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ slot }),
      });
      const d = await r.json();
      if (!r.ok) setSvar(d.error ?? "Noget gik galt.");
      else if (!d.type) setSvar(d.fejl ?? "Der er ingen story til dette tidspunkt i dag.");
      else
        setSvar(
          (d.platforme as { platform: string; status: string; besked?: string }[])
            .map((p) => `${p.platform === "facebook" ? "Facebook" : "Instagram"}: ${STATUS[p.status] ?? p.status}${p.besked ? ` (${p.besked})` : ""}`)
            .join(" · ")
        );
    } catch {
      setSvar("Ingen forbindelse. Prøv igen.");
    } finally {
      setTravl(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={koer}
        disabled={travl}
        style={{ padding: "8px 12px", background: "#0d3b2e", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer", width: 260 }}
      >
        {travl ? "Lægger op …" : label}
      </button>
      {svar && <p style={{ fontSize: 13, margin: "6px 0 0", maxWidth: 260 }}>{svar}</p>}
    </div>
  );
}
