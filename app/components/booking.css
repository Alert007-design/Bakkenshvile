@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;1,9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap");

:root {
  --bh-green: #0d3b2e;
  --bh-green-deep: #082921;
  --bh-gold: #c9a227;
  --bh-red: #8a1f2b;
  --bh-cream: #f6f1e4;
  --bh-ink: #1a1a16;
  --bh-line: rgba(13, 59, 46, 0.18);
  --radius: 2px;
}

.page h1,
.page h2,
.page h3 {
  font-family: "Fraunces", serif;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.01em;
  color: var(--bh-ink);
}

.page .mono {
  font-family: "IBM Plex Mono", monospace;
}

.page button {
  font-family: inherit;
}

/* Perforeret billet-kant — det visuelle signatur-element */
.page .ticket-edge {
  position: relative;
}
.page .ticket-edge::before,
.page .ticket-edge::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 22px;
  background-image: radial-gradient(
    circle at 11px 0,
    transparent 10px,
    var(--bh-cream) 10.5px
  );
  background-size: 22px 22px;
  background-repeat: repeat-y;
}
.page .ticket-edge::before {
  left: -1px;
}
.page .ticket-edge::after {
  right: -1px;
  transform: scaleX(-1);
}

.page ::selection {
  background: var(--bh-gold);
  color: var(--bh-ink);
}

.page {
  max-width: 1040px;
  margin: 0 auto;
  padding: 48px 24px 120px;
  background: var(--bh-cream);
  min-height: 100vh;
  color: var(--bh-ink);
  font-family: "Inter", system-ui, sans-serif;
}

.page a {
  color: inherit;
}

.eyebrow {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--bh-green);
  opacity: 0.75;
}

/* --- Hero: billet-stub --- */
.hero {
  background: var(--bh-green);
  color: var(--bh-cream);
  border-radius: var(--radius);
  padding: 40px 44px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: center;
  position: relative;
  overflow: hidden;
}
.hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    115deg,
    rgba(201, 162, 39, 0.05) 0px,
    rgba(201, 162, 39, 0.05) 1px,
    transparent 1px,
    transparent 34px
  );
  pointer-events: none;
}
.hero-title {
  font-size: clamp(28px, 4vw, 42px);
  color: var(--bh-cream);
  line-height: 1.05;
}
.hero-meta {
  margin-top: 14px;
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  font-size: 14px;
  color: rgba(246, 241, 228, 0.85);
}
.hero-meta b {
  color: var(--bh-gold);
  font-weight: 600;
}
.hero-stub {
  text-align: right;
  border-left: 1px dashed rgba(246, 241, 228, 0.35);
  padding-left: 24px;
}
.hero-stub .mono {
  font-size: 12px;
  color: rgba(246, 241, 228, 0.6);
}
.hero-stub .stub-since {
  font-size: 30px;
  color: var(--bh-gold);
  font-family: "Fraunces", serif;
  font-weight: 700;
}

.notice {
  margin-top: 18px;
  font-size: 13px;
  background: rgba(201, 162, 39, 0.1);
  border: 1px solid rgba(201, 162, 39, 0.35);
  padding: 12px 16px;
  border-radius: var(--radius);
  color: var(--bh-green-deep);
}

/* --- Sections --- */
.section {
  margin-top: 56px;
}
.section-title {
  font-size: 22px;
  margin-bottom: 4px;
}
.section-sub {
  color: rgba(26, 26, 22, 0.6);
  font-size: 14px;
  margin-bottom: 20px;
}

.ticket-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--bh-line);
}
.ticket-row:first-child {
  border-top: 1px solid var(--bh-line);
}
.ticket-name {
  font-weight: 600;
}
.ticket-price {
  font-family: "IBM Plex Mono", monospace;
  font-size: 14px;
  color: rgba(26, 26, 22, 0.7);
  min-width: 90px;
  text-align: right;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stepper button {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--bh-green);
  background: transparent;
  color: var(--bh-green);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}
.stepper button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.stepper span {
  min-width: 18px;
  text-align: center;
  font-family: "IBM Plex Mono", monospace;
}

.addon-groups {
  display: grid;
  gap: 28px;
}
.addon-group h4 {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bh-red);
  margin: 0 0 10px;
}
.addon-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px dotted var(--bh-line);
  font-size: 14px;
}
.addon-item label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.addon-price {
  font-family: "IBM Plex Mono", monospace;
  color: rgba(26, 26, 22, 0.65);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-grid .full {
  grid-column: 1 / -1;
}
.field label {
  display: block;
  font-size: 12px;
  font-family: "IBM Plex Mono", monospace;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 6px;
  color: rgba(26, 26, 22, 0.6);
}
.field input,
.field textarea {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--bh-line);
  border-radius: var(--radius);
  background: #fff;
  font-family: "Inter", sans-serif;
  font-size: 14px;
}
.field input:focus,
.field textarea:focus {
  outline: 2px solid var(--bh-gold);
  outline-offset: 1px;
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.date-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid var(--bh-line);
  border-radius: var(--radius);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, transform 0.1s ease;
}
.date-btn:hover {
  border-color: var(--bh-green);
  transform: translateY(-1px);
}
.date-btn-day {
  font-weight: 600;
  font-size: 14px;
  color: var(--bh-ink);
  text-transform: capitalize;
}
.date-btn-time {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  color: rgba(26, 26, 22, 0.6);
}

/* --- Summary bar --- */
.summary {
  position: sticky;
  bottom: 20px;
  margin-top: 48px;
  background: var(--bh-ink);
  color: var(--bh-cream);
  border-radius: var(--radius);
  padding: 20px 26px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}
.summary-total {
  font-family: "Fraunces", serif;
  font-size: 24px;
  color: var(--bh-gold);
}
.summary-count {
  font-size: 12px;
  color: rgba(246, 241, 228, 0.6);
  font-family: "IBM Plex Mono", monospace;
}
.submit-btn {
  background: var(--bh-red);
  color: var(--bh-cream);
  border: none;
  padding: 13px 26px;
  border-radius: var(--radius);
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
  letter-spacing: 0.02em;
}
.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.submit-btn:hover:not(:disabled) {
  background: #a4283a;
}

.confirmation {
  margin-top: 48px;
  padding: 32px;
  background: var(--bh-green);
  color: var(--bh-cream);
  text-align: center;
  border-radius: var(--radius);
}
.confirmation .mono {
  color: var(--bh-gold);
  font-size: 18px;
}

.error-msg {
  margin-top: 16px;
  color: var(--bh-red);
  font-size: 13px;
}

@media (max-width: 640px) {
  .hero {
    grid-template-columns: 1fr;
  }
  .hero-stub {
    border-left: none;
    border-top: 1px dashed rgba(246, 241, 228, 0.35);
    padding-left: 0;
    padding-top: 16px;
    text-align: left;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .summary {
    flex-direction: column;
    gap: 14px;
    align-items: stretch;
  }
}
