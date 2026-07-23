:root {
  --ink-950: oklch(0.13 0.02 40);
  --ink-900: oklch(0.15 0.02 40);
  --ink-800: oklch(0.18 0.02 40);
  --paper: oklch(0.95 0.01 80);
  --paper-dim: oklch(0.82 0.01 80);
  --muted: oklch(0.7 0.01 80);
  --gold: oklch(0.78 0.12 85);
  --gold-hover: oklch(0.85 0.13 88);
  --line: oklch(0.3 0.03 60 / 0.3);
  --line-strong: oklch(0.35 0.03 60 / 0.5);

  --font-display: "Playfair Display", ui-serif, Georgia, serif;
  --font-body: "Work Sans", ui-sans-serif, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--ink-900);
  color: var(--paper);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

a {
  color: var(--gold);
  text-decoration: none;
}

a:hover {
  color: var(--gold-hover);
}

button {
  font-family: inherit;
}

::selection {
  background: var(--gold);
  color: var(--ink-950);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}

/* ---------- layout ---------- */

.wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 48px;
}

/* ---------- nav ---------- */

.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 48px;
  background: oklch(0.13 0.02 40 / 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line-strong);
}

.logo {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 22px;
  letter-spacing: 0.04em;
}

.logoAccent {
  color: var(--gold);
}

.navlinks {
  display: flex;
  align-items: center;
  gap: 32px;
}

.navlinks a {
  font-size: 14px;
  letter-spacing: 0.03em;
  color: var(--paper-dim);
  text-transform: uppercase;
}

.navCta,
.ctaGold {
  background: var(--gold);
  color: var(--ink-950);
  padding: 11px 22px;
  border-radius: 2px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  display: inline-block;
  border: none;
  cursor: pointer;
}

.ctaGold:hover {
  filter: brightness(1.05);
}

.ctaOutline {
  border: 1px solid oklch(0.6 0.02 80 / 0.5);
  color: var(--paper);
  padding: 17px 34px;
  border-radius: 2px;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  display: inline-block;
}

/* ---------- hero ---------- */

.hero {
  position: relative;
  min-height: 88vh;
  display: flex;
  align-items: center;
}

.heroBg {
  position: absolute;
  inset: 0;
}

.heroBg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.heroScrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    oklch(0.13 0.02 40 / 0.55) 0%,
    oklch(0.13 0.02 40 / 0.75) 55%,
    oklch(0.13 0.02 40 / 0.97) 100%
  );
  pointer-events: none;
}

.heroInner {
  position: relative;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 48px;
  width: 100%;
}

.eyebrow {
  font-family: var(--font-body);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-size: 13px;
  color: var(--gold);
  margin: 0 0 18px;
}

.hero h1 {
  font-family: var(--font-display);
  font-weight: 900;
  font-style: italic;
  font-size: clamp(3rem, 7vw, 6.5rem);
  line-height: 0.98;
  margin: 0 0 28px;
  max-width: 16ch;
}

.heroLead {
  font-size: 19px;
  line-height: 1.7;
  color: oklch(0.88 0.01 80);
  max-width: 52ch;
  margin: 0 0 40px;
}

.heroCtas {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
}

.ctaGoldLg {
  background: var(--gold);
  color: var(--ink-950);
  padding: 17px 34px;
  border-radius: 2px;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  display: inline-block;
}

/* ---------- section shell ---------- */

.section {
  padding: 120px 48px;
  border-top: 1px solid var(--line);
}

.sectionAlt {
  background: var(--ink-950);
}

.sectionTitle {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2rem, 3.5vw, 3rem);
  margin: 0 0 64px;
  text-align: center;
}

/* ---------- om os ---------- */

.aboutGrid {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 72px;
  align-items: center;
}

.aboutGrid h2 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2rem, 3.5vw, 3rem);
  line-height: 1.1;
  margin: 0 0 28px;
}

.aboutGrid p {
  font-size: 17px;
  line-height: 1.8;
  color: var(--paper-dim);
  margin: 0 0 20px;
}

.aboutPhoto {
  position: relative;
  aspect-ratio: 4 / 5;
  border-radius: 3px;
  overflow: hidden;
}

.aboutPhoto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ---------- sangerinderne ---------- */

.singerGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 32px;
}

.singerCard {
  text-align: center;
}

.singerPhoto {
  aspect-ratio: 3 / 4;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 20px;
}

.singerPhoto img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.singerName {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 20px;
  margin: 0;
}

/* ---------- priser ---------- */

.priceGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
}

.priceCard {
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: 40px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.priceCard h3 {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 22px;
  margin: 0;
}

.priceCard .amount {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 32px;
  color: var(--gold);
  margin: 0;
}

.priceCard p.desc {
  font-size: 15px;
  line-height: 1.7;
  color: oklch(0.75 0.01 80);
  margin: 0;
  flex: 1;
}

/* ---------- galleri ---------- */

.galleryGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 220px;
  gap: 20px;
}

.galleryGrid img,
.galleryGrid .placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 2px;
}

.galleryGrid .placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(
    45deg,
    oklch(0.2 0.02 40),
    oklch(0.2 0.02 40) 10px,
    oklch(0.22 0.02 40) 10px,
    oklch(0.22 0.02 40) 20px
  );
  font-family: monospace;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  padding: 12px;
}

.galleryFeature {
  grid-column: span 2;
  grid-row: span 2;
}

/* ---------- book ---------- */

.bookWrap {
  max-width: 860px;
  margin: 0 auto;
}

.bookLead {
  font-size: 17px;
  line-height: 1.8;
  color: var(--paper-dim);
  text-align: center;
  max-width: 60ch;
  margin: 0 auto 56px;
}

.bookForm {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.bookField {
  display: flex;
  flex-direction: column;
}

.bookField.full {
  grid-column: span 2;
}

.bookField label {
  display: block;
  font-size: 13px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.bookField input,
.bookField textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--ink-800);
  border: 1px solid var(--line-strong);
  border-radius: 2px;
  padding: 14px 16px;
  color: var(--paper);
  font-size: 15px;
  font-family: var(--font-body);
}

.bookField textarea {
  resize: vertical;
}

.bookSubmitRow {
  grid-column: span 2;
  text-align: center;
  margin-top: 12px;
}

.bookSubmit {
  background: var(--gold);
  color: var(--ink-950);
  border: none;
  padding: 17px 40px;
  border-radius: 2px;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
}

.bookSubmit:hover {
  filter: brightness(1.05);
}

.bookSuccess {
  border: 1px solid oklch(0.78 0.12 85 / 0.5);
  background: oklch(0.78 0.12 85 / 0.08);
  border-radius: 4px;
  padding: 32px;
  text-align: center;
}

.bookSuccess .title {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--gold);
  margin: 0 0 8px;
}

.bookSuccess p {
  font-size: 15px;
  color: oklch(0.85 0.01 80);
  margin: 0;
}

/* ---------- kontakt ---------- */

.contactGrid {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 72px;
}

.contactGrid h2 {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2rem, 3.5vw, 3rem);
  margin: 0 0 32px;
}

.contactList {
  display: flex;
  flex-direction: column;
  gap: 24px;
  font-size: 16px;
  line-height: 1.7;
  color: oklch(0.85 0.01 80);
}

.contactList .label {
  color: var(--muted);
  font-size: 13px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin: 0 0 6px;
}

.contactSocial {
  display: flex;
  gap: 20px;
}

.contactPhoto {
  position: relative;
  border-radius: 3px;
  overflow: hidden;
  aspect-ratio: 4 / 3;
}

.contactPhoto .placeholder {
  width: 100%;
  height: 100%;
}

/* ---------- footer ---------- */

.footer {
  padding: 48px;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.footer .brand {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
}

.footer .meta {
  font-size: 13px;
  color: var(--muted);
}

/* ---------- responsive ---------- */

@media (max-width: 900px) {
  .aboutGrid,
  .contactGrid {
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .singerGrid {
    grid-template-columns: repeat(2, 1fr);
  }

  .priceGrid {
    grid-template-columns: 1fr;
  }

  .navlinks a {
    display: none;
  }

  .section {
    padding: 72px 24px;
  }

  .nav {
    padding: 16px 24px;
  }

  .heroInner {
    padding: 0 24px;
  }
}

@media (max-width: 560px) {
  .bookForm {
    grid-template-columns: 1fr;
  }

  .bookField.full,
  .bookSubmitRow {
    grid-column: span 1;
  }

  .galleryGrid {
    grid-template-columns: 1fr;
  }

  .galleryFeature {
    grid-column: span 1;
    grid-row: span 1;
  }
}
