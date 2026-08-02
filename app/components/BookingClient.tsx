"use client";

import { useMemo, useState } from "react";
import {
  addonsTotalDiscountKr,
  discountedAddonUnitKr,
  ADDON_DISCOUNT_LABEL,
} from "@/lib/pricing";
import { getTable, tableNumberFor } from "@/lib/tables";
import "./booking.css";

type Ticket = {
  id: string;
  category: string;
  price: number;
  fee: number;
  maxCount: number;
  priceGroup: string;
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
  // Prisgruppen fra Events ("Ordinær", "Forpremiere 10. maj", ...).
  // Bestemmer hvilke billettyper der vises for datoen.
  priceGroup: string;
  // Udsolgt-flag fra Events. Udsolgte datoer vises, men kan ikke bookes.
  soldOut: boolean;
  // Om onlinerabatten på drikkevarer stadig er aktiv for datoen (før kl. 12.00
  // dansk tid på forestillingsdagen). Beregnet serverside; checkout håndhæver
  // det samme, så visningen aldrig lover en rabat, der ikke gives.
  discountActive: boolean;
  // Valgfrit "Få pladser"/"premiere"-hint. Findes ikke i Airtable endnu;
  // "soldout" udledes nu i stedet af feltet soldOut ovenfor.
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

type BadgeType = ShowStatus | "forpremiere";

function isSoldOut(show: ShowDate): boolean {
  return show.soldOut || show.status === "soldout";
}

// Kan returnere flere mærker, fx både "Premiere" og "Udsolgt" på samme dato.
// Premiere/Forpremiere-mærket udledes af titlen, ikke af datoens placering i
// sæsonen — så det bliver ved med at være rigtigt, uanset om datoer tilføjes
// eller fjernes. Udsolgt vises ved siden af, ikke i stedet for.
function getBadges(show: ShowDate): { type: BadgeType; label: string }[] {
  const badges: { type: BadgeType; label: string }[] = [];
  const title = show.title.trim().toLowerCase();
  if (title.startsWith("forpremiere"))
    badges.push({ type: "forpremiere", label: "Forpremiere" });
  else if (title.startsWith("premiere") || show.status === "premiere")
    badges.push({ type: "premiere", label: "Premiere" });
  if (show.status === "few") badges.push({ type: "few", label: "Få pladser" });
  if (isSoldOut(show)) badges.push({ type: "soldout", label: "Udsolgt" });
  return badges;
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

/**
 * Pladsoversigt over salen i Bakkens Hvile.
 *
 * Bordfordeling (44 borde i alt, 4 personer pr. bord):
 *   A+ 1.-3. række   3 rækker à 5 borde   = 15 borde
 *   A+ 4.-6. række   3 rækker à 5 borde   = 15 borde
 *   A  7.-9. række   4 + 4 + 3            = 11 borde
 *   B                venstre bord i 9. rk. + 2 borde i 10. rk. = 3 borde
 */

const C = {
  panel: "#1B2C45",
  gold: "#C9A63A",
  cream: "#F2E9D8",
  muted: "rgba(242, 233, 216, 0.55)",
  aplusHigh: "#E9C96B",
  aplusLow: "#BF9433",
  a: "#7B93A8",
  b: "#4E5F73",
  stolpe: "#8A8578",
} as const;

const TW = 40;
const TH = 36;

const COLS5 = [110, 166, 222, 278, 334];
const COLS4 = [110, 166, 222, 278];
const COLS2 = [110, 166];

// Visuel nuance for A+-borde (kun kosmetisk: øverste vs. nederste halvdel af
// A+-området). Selve kategorien (A+/A/B) udledes fra lib/tables.ts, så salplanen
// og bordbestillingen deler præcis samme borddefinition.
type Shade = "aplusHigh" | "aplusLow";

const ROWS: {
  n: number;
  y: number;
  cols: number[];
  shade: Shade;
}[] = [
  { n: 1, y: 112, cols: COLS5, shade: "aplusHigh" },
  { n: 2, y: 160, cols: COLS5, shade: "aplusHigh" },
  { n: 3, y: 208, cols: COLS5, shade: "aplusHigh" },
  { n: 4, y: 264, cols: COLS5, shade: "aplusLow" },
  { n: 5, y: 312, cols: COLS5, shade: "aplusLow" },
  { n: 6, y: 388, cols: COLS5, shade: "aplusLow" },
  { n: 7, y: 448, cols: COLS4, shade: "aplusLow" },
  { n: 8, y: 496, cols: COLS4, shade: "aplusLow" },
  { n: 9, y: 544, cols: COLS4, shade: "aplusLow" },
  { n: 10, y: 592, cols: COLS2, shade: "aplusLow" },
];

// Farve for et bord ud fra dets kategori i den fælles borddefinition. A+ bruger
// rækkens visuelle nuance; A og B har hver sin faste farve.
function tableFill(rowN: number, colCount: number, i: number, shade: Shade): string {
  // Placeringen tælles fra baren (højre side) og indad; kolonnerne tegnes
  // venstre→højre, så den yderste kolonne (i=0) er den højeste placering.
  const number = tableNumberFor(rowN, colCount - i);
  const category = getTable(number)?.category;
  if (category === "B") return C.b;
  if (category === "A") return C.a;
  return C[shade];
}

const STOLPER = [
  { x: 152, y: 430 },
  { x: 300, y: 430 },
  { x: 152, y: 530 },
];

const LEGEND = [
  { x: 40, y: 728, fill: C.aplusHigh, label: "A+ (1.-3. række)" },
  { x: 190, y: 728, fill: C.aplusLow, label: "A+ (4.-6. række)" },
  { x: 340, y: 728, fill: C.a, label: "A (7.-9. række)" },
  { x: 40, y: 754, fill: C.b, label: "B (10. række)" },
  { x: 190, y: 754, fill: C.stolpe, label: "Stolpe" },
];

function Panel({
  x,
  y,
  w,
  h,
  label,
  vertical = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  vertical?: boolean;
}) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={4}
        fill={C.panel}
        stroke={C.gold}
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fill={C.cream}
        letterSpacing="0.06em"
        transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
      >
        {label}
      </text>
    </g>
  );
}

function SeatingChart() {
  return (
    <svg
      viewBox="0 0 560 800"
      width="100%"
      role="img"
      aria-labelledby="pladsoversigt-titel pladsoversigt-beskrivelse"
      style={{ display: "block", maxWidth: 560, margin: "0 auto", height: "auto" }}
    >
      <title id="pladsoversigt-titel">Pladsoversigt over salen</title>
      <desc id="pladsoversigt-beskrivelse">
        Salen har 44 borde med plads til fire personer ved hvert bord, fordelt på
        ti rækker. Række 1 til 6 er kategori A plus, række 7 til 9 er kategori A,
        og kategori B består af det venstre bord i 9. række samt de to borde i
        10. række. Scenen ligger forrest, bar og toiletter langs højre side, og
        indgangen er bagest.
      </desc>

      <defs>
        <marker
          id="pil-op"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M2 1L8 5L2 9"
            fill="none"
            stroke={C.muted}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>

      <Panel x={130} y={24} w={224} h={52} label="Scene" />
      <Panel x={416} y={104} w={44} h={104} label="Bar" vertical />
      <Panel x={416} y={224} w={44} h={140} label="Toiletter" vertical />

      <rect
        x={336}
        y={440}
        width={64}
        height={196}
        rx={4}
        fill="none"
        stroke={C.gold}
        strokeOpacity={0.25}
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={368}
        y={538}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fill={C.muted}
        letterSpacing="0.06em"
        transform="rotate(-90 368 538)"
      >
        Forhøjning
      </text>
      <text x={412} y={492} fontSize={12} fill={C.muted}>
        1 trin
      </text>
      <text x={412} y={588} fontSize={12} fill={C.muted}>
        2 trin
      </text>

      <line
        x1={462}
        y1={676}
        x2={462}
        y2={632}
        stroke={C.muted}
        strokeWidth={1.5}
        markerEnd="url(#pil-op)"
      />
      <text x={462} y={698} textAnchor="middle" fontSize={12} fill={C.muted}>
        Indgang
      </text>

      <text x={56} y={268} fontSize={20} fill={C.aplusHigh} letterSpacing="0.04em">
        A+
      </text>
      <text x={56} y={514} fontSize={20} fill={C.a} letterSpacing="0.04em">
        A
      </text>
      <text x={56} y={614} fontSize={20} fill={C.b} letterSpacing="0.04em">
        B
      </text>

      <line
        x1={110}
        y1={254}
        x2={374}
        y2={254}
        stroke={C.gold}
        strokeOpacity={0.4}
        strokeWidth={1}
      />

      <text
        x={242}
        y={366}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fill={C.muted}
        fontStyle="italic"
      >
        Mellemgang — plads til 2-3 kørestole
      </text>

      <line
        x1={110}
        y1={436}
        x2={374}
        y2={436}
        stroke={C.gold}
        strokeOpacity={0.25}
        strokeWidth={1}
        strokeDasharray="5 5"
      />

      {ROWS.map((row) =>
        row.cols.map((x, i) => (
          <rect
            key={`${row.n}-${x}`}
            x={x}
            y={row.y}
            width={TW}
            height={TH}
            rx={4}
            fill={tableFill(row.n, row.cols.length, i, row.shade)}
          />
        ))
      )}

      {ROWS.map((row) => (
        <text
          key={`nr-${row.n}`}
          x={96}
          y={row.y + TH / 2}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={12}
          fill={C.muted}
        >
          {row.n}
        </text>
      ))}

      {STOLPER.map((s) => (
        <rect
          key={`stolpe-${s.x}-${s.y}`}
          x={s.x}
          y={s.y}
          width={11}
          height={11}
          fill={C.stolpe}
        />
      ))}

      <Panel x={222} y={592} w={140} h={36} label="Billetsalg" />

      {LEGEND.map((item) => (
        <g key={item.label}>
          <rect x={item.x} y={item.y} width={14} height={14} rx={3} fill={item.fill} />
          <text
            x={item.x + 20}
            y={item.y + 7}
            dominantBaseline="central"
            fontSize={12}
            fill={C.muted}
          >
            {item.label}
          </text>
        </g>
      ))}
    </svg>
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
  const [showSeatingChart, setShowSeatingChart] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const selectedShow = showDates.find((s) => s.id === selectedId) ?? null;

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

  // Kun billettyper hvis prisgruppe matcher den valgte dato, dyreste først.
  // Sorteres på pris (faldende) frem for hårdkodede kategorinavne.
  const visibleTickets = useMemo(() => {
    if (!selectedShow) return [];
    return tickets
      .filter((t) => t.priceGroup === selectedShow.priceGroup)
      .sort((a, b) => b.price + b.fee - (a.price + a.fee));
  }, [tickets, selectedShow]);

  const totalTickets = Object.values(ticketQty).reduce((a, b) => a + b, 0);

  const ticketsTotal = useMemo(() => {
    let sum = 0;
    for (const t of visibleTickets) sum += (ticketQty[t.id] || 0) * (t.price + t.fee);
    return sum;
  }, [visibleTickets, ticketQty]);

  const addonSubtotal = useMemo(() => {
    let sum = 0;
    for (const a of addons) sum += (addonQty[a.id] || 0) * a.price;
    return sum;
  }, [addons, addonQty]);

  // Onlinerabatten gælder kun indtil kl. 12.00 dansk tid på forestillingsdagen.
  // Er datoen forbi grænsen, er der ingen rabat — hverken i visningen her eller
  // i checkout (som håndhæver det samme serverside).
  const discountActive = selectedShow?.discountActive ?? false;

  // Rabatten er summen af de enhedsfloorede rabatter via den delte
  // hjælpefunktion — nøjagtig samme tal som serveren beregner ved betaling, og
  // linjerne summerer præcis til totalen. Nul når rabatvinduet er lukket.
  const discount = useMemo(
    () =>
      discountActive
        ? addonsTotalDiscountKr(
            addons
              .filter((a) => addonQty[a.id])
              .map((a) => ({ unitKr: a.price, quantity: addonQty[a.id] }))
          )
        : 0,
    [addons, addonQty, discountActive]
  );

  const total = ticketsTotal + addonSubtotal - discount;

  // Skift dato: nulstil billetantal, så mængder fra en anden prisgruppe
  // aldrig følger med over på den nye dato.
  function selectDate(id: string | null) {
    setSelectedId(id);
    setTicketQty({});
    setError(null);
  }

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
    if (selectedShow.soldOut) {
      setError("Denne dato er udsolgt.");
      return;
    }
    if (totalTickets === 0) {
      setError("Vælg mindst én billet.");
      return;
    }
    if (!customer.name || (!customer.phone && !customer.email)) {
      setError("Udfyld navn samt telefon eller e-mail.");
      return;
    }
    if (!acceptedTerms) {
      setError(
        "Du skal acceptere handelsbetingelserne og have læst privatlivspolitikken."
      );
      return;
    }
    setSubmitting(true);
    try {
      const showLabel = `${formatShortDate(selectedShow.date)} kl. ${selectedShow.time}`;
      // Ny kontrakt: browseren sender KUN id'er og antal — aldrig priser eller
      // navne. Serveren slår priser og prisgruppe op i Airtable og er den
      // autoritative kilde til beløbet. Klientens total ovenfor er rent
      // kosmetisk.
      const ticketSelection = visibleTickets
        .filter((t) => ticketQty[t.id])
        .map((t) => ({ ticketTypeId: t.id, quantity: ticketQty[t.id] }));
      const addonSelection = addons
        .filter((a) => addonQty[a.id])
        .map((a) => ({ addonId: a.id, quantity: addonQty[a.id] }));

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          specialRequests: `Show: ${showLabel}${
            specialRequests ? " — " + specialRequests : ""
          }`,
          tickets: ticketSelection,
          addons: addonSelection,
          showId: selectedShow.id,
          acceptTerms: acceptedTerms,
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
          <div className="eyebrow">
            <a href="/">Bakkens Hvile · Underholdning siden 1877</a>
          </div>
          <h1 className="jubilee-title">150-års jubilæumsshow 2027</h1>
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
                  const badges = getBadges(s);
                  const soldOut = isSoldOut(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`date-picker-btn${
                        soldOut ? " is-soldout" : ""
                      }`}
                      onClick={() => !soldOut && selectDate(s.id)}
                      disabled={soldOut}
                      aria-disabled={soldOut || undefined}
                      aria-label={`${formatShortDate(s.date)} kl. ${s.time}${
                        badges.length
                          ? ", " + badges.map((b) => b.label).join(", ")
                          : ""
                      }`}
                    >
                      {badges.length > 0 && (
                        <span className="date-picker-badges">
                          {badges.map((b) => (
                            <span
                              key={b.type}
                              className={`date-picker-badge badge-${b.type}`}
                            >
                              {b.label}
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="date-picker-day">
                        {formatShortDate(s.date)}
                      </span>
                      <span className="date-picker-time">kl. {s.time}</span>
                      {!soldOut && (
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
          onClick={() => selectDate(null)}
        >
          Skift dato
        </button>
      </div>
      {selectedShow.notes && <div className="notice">{selectedShow.notes}</div>}

      <div className="section">
        <div className="section-title">Vælg billetter</div>
        <div className="section-sub">
          Alle priser er inklusive 25 % moms og gebyr. Momsbeløbet svarer til 20 %
          af den samlede pris inklusive moms.
        </div>
        <button
          type="button"
          className="seating-chart-toggle"
          onClick={() => setShowSeatingChart((v) => !v)}
          aria-expanded={showSeatingChart}
        >
          {showSeatingChart ? "Skjul pladsoversigt" : "Se pladsoversigt i salen"}
        </button>
        {showSeatingChart && (
          <div className="seating-chart-wrap">
            <SeatingChart />
          </div>
        )}
        {visibleTickets.length === 0 ? (
          <div className="notice" role="status">
            Der er desværre ingen billetter tilgængelige for denne dato. Kontakt
            os på{" "}
            <a href="mailto:kontor@bakkenshvile.dk">kontor@bakkenshvile.dk</a>,
            hvis du har spørgsmål.
          </div>
        ) : (
          visibleTickets.map((t) => (
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
          ))
        )}
      </div>

      {groupedAddons.length > 0 && (
        <div className="section">
          <div className="section-title">Tilvalg</div>
          <div className="section-sub">
            {discountActive
              ? "Drikkevarer og snacks til bordet — 10 % onlinerabat er trukket fra. Rabatten gælder til kl. 12.00 på forestillingsdagen."
              : "Drikkevarer og snacks til bordet. Onlinerabatten er udløbet (den gælder til kl. 12.00 på forestillingsdagen), så de almindelige priser gælder."}
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
                        {discountActive ? (
                          <>
                            <span className="addon-price-full">{kr(a.price)}</span>{" "}
                            <span className="addon-price-discounted">
                              {kr(discountedAddonUnitKr(a.price))}
                            </span>
                          </>
                        ) : (
                          <span className="addon-price-discounted">{kr(a.price)}</span>
                        )}
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
        </div>
      )}

      <div className="section">
        <div className="section-title">Dine oplysninger</div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cust-name">Fornavn og efternavn *</label>
            <input
              id="cust-name"
              type="text"
              autoComplete="name"
              required
              aria-required="true"
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
              type="text"
              autoComplete="organization"
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
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-required="true"
              value={customer.phone}
              onChange={(e) =>
                setCustomer({ ...customer, phone: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="cust-email">E-mail *</label>
            <input
              id="cust-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-required="true"
              value={customer.email}
              onChange={(e) =>
                setCustomer({ ...customer, email: e.target.value })
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
          billetkategori, I har købt. Bordene i salen rummer op til fire
          personer, og jeres selskab kan derfor komme til at dele bord med
          andre gæster.
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

      <div className="section">
        <label className="terms-accept">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          <span>
            Jeg accepterer Bakkens Hviles{" "}
            <a href="/handelsbetingelser" target="_blank" rel="noopener noreferrer">
              handelsbetingelser
            </a>{" "}
            og har læst{" "}
            <a href="/privatlivspolitik" target="_blank" rel="noopener noreferrer">
              privatlivspolitikken
            </a>
            .
          </span>
        </label>
      </div>

      <div className="summary">
        <div>
          {discount > 0 && (
            <>
              <div className="summary-line">
                <span>Subtotal</span>
                <span>{kr(ticketsTotal + addonSubtotal)}</span>
              </div>
              <div className="summary-discount">
                <span>{ADDON_DISCOUNT_LABEL}</span>
                <span className="summary-discount-amount">−{kr(discount)}</span>
              </div>
            </>
          )}
          <div className="summary-total">{kr(total)}</div>
          <div className="summary-count">
            {totalTickets} billet{totalTickets === 1 ? "" : "ter"}
          </div>
        </div>
        <button
          className="submit-btn"
          onClick={submit}
          disabled={submitting || !acceptedTerms}
        >
          {submitting ? "Sender..." : "Gå til betaling"}
        </button>
      </div>
    </div>
  );
}
