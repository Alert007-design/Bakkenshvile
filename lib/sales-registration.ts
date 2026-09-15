// Grænseflade til registrering af salg fra QR-bordbestillingen.
//
// Huset er registreret som teater og er efter husets egen afklaring ikke
// omfattet af kravet om digitalt salgsregistreringssystem. Live-tilstand fejler
// derfor ikke længere lukket: standarden i live er "none", som registrerer
// ordren i loggen uden at kalde et kassesystem.
//
// Tilstanden vælges med SALES_REGISTRATION (none | test | live):
//   none  Ingen ekstern registrering. Ordren logges. Standard i live-tilstand.
//   test  Testdata (CSV/spejling til intern kontrol). Standard uden live.
//   live  Eksternt kassesystem. Kroggen er bevaret: skal huset senere alligevel
//         koble et system på, erstattes UnconfiguredLiveSalesRegistration af en
//         rigtig implementering, og SALES_REGISTRATION sættes til "live".
//         Indtil da fejler "live" bevidst lukket, så tilstanden ikke kan vælges
//         i den tro, at der registreres noget.

import { isLiveMode } from "@/lib/table-ordering-config";

export interface PaidOrderLine {
  name: string;
  productCode: string;
  quantity: number;
  unitPriceOre: number;
  vatRate: number;
  lineTotalOre: number;
}

export interface PaidOrder {
  orderId: string;
  orderNumber: string;
  eventId: string;
  tableNumber: number;
  currency: string;
  subtotalOre: number;
  vatOre: number;
  totalOre: number;
  paidAt: string;
  lines: PaidOrderLine[];
}

export interface RefundedOrder {
  orderId: string;
  orderNumber: string;
  totalOre: number;
  refundedAt: string;
}

/** Hvordan salget registreres. Se filens hoved for valget mellem dem. */
export type SalesRegistrationMode = "none" | "test" | "live";

export interface RegistrationResult {
  ok: boolean;
  mode: SalesRegistrationMode;
  reference?: string;
}

export interface DailyCloseResult {
  eventId: string;
  paidCount: number;
  grossOre: number;
  refundedOre: number;
  netOre: number;
}

export interface SalesRegistration {
  registerPaidOrder(order: PaidOrder): Promise<RegistrationResult>;
  registerRefund(order: RefundedOrder): Promise<RegistrationResult>;
  closeBusinessDay(eventId: string): Promise<DailyCloseResult>;
}

export class SalesRegistrationError extends Error {}

// CSV-linje til intern kontrol (kun testtilstand). Felterne citeres sikkert.
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER =
  "ordrenr,event,bord,produktkode,vare,antal,enhedspris_ore,moms_pct,linje_ore,betalt";

export function orderToCsvRows(order: PaidOrder): string[] {
  return order.lines.map((l) =>
    [
      csvField(order.orderNumber),
      csvField(order.eventId),
      csvField(order.tableNumber),
      csvField(l.productCode),
      csvField(l.name),
      csvField(l.quantity),
      csvField(l.unitPriceOre),
      csvField(l.vatRate),
      csvField(l.lineTotalOre),
      csvField(order.paidAt),
    ].join(",")
  );
}

/**
 * Testtilstand: registrerer salg som testdata. En sink-funktion modtager
 * CSV-linjerne (kan skrive til fil, Airtable eller log). Aldrig en godkendt
 * produktionsløsning.
 */
export class TestSalesRegistration implements SalesRegistration {
  constructor(private sink?: (rows: string[]) => Promise<void> | void) {}

  async registerPaidOrder(order: PaidOrder): Promise<RegistrationResult> {
    const rows = orderToCsvRows(order);
    await this.sink?.(rows);
    return { ok: true, mode: "test", reference: `test-${order.orderNumber}` };
  }

  async registerRefund(order: RefundedOrder): Promise<RegistrationResult> {
    await this.sink?.([`refund,${order.orderNumber},${order.totalOre},${order.refundedAt}`]);
    return { ok: true, mode: "test", reference: `test-refund-${order.orderNumber}` };
  }

  async closeBusinessDay(eventId: string): Promise<DailyCloseResult> {
    // Testtilstand laver ikke en rigtig dagsafslutning.
    return { eventId, paidCount: 0, grossOre: 0, refundedOre: 0, netOre: 0 };
  }
}

/**
 * Ingen ekstern salgsregistrering. Ordren skrives til loggen, så der findes et
 * driftsspor, og flowet fortsætter. Standard i live-tilstand, fordi huset som
 * teater ikke er omfattet af kravet om digitalt salgsregistreringssystem.
 *
 * Beløb logges i øre præcis som de står på ordren — aldrig omregnet her.
 */
export class NoSalesRegistration implements SalesRegistration {
  constructor(private log: (msg: string) => void = console.info) {}

  async registerPaidOrder(order: PaidOrder): Promise<RegistrationResult> {
    this.log(
      `Salg registreret (ingen ekstern registrering): ${order.orderNumber} · ` +
        `event ${order.eventId} · bord ${order.tableNumber} · ` +
        `${order.totalOre} øre (moms ${order.vatOre} øre) · ${order.paidAt}`
    );
    return { ok: true, mode: "none", reference: order.orderNumber };
  }

  async registerRefund(order: RefundedOrder): Promise<RegistrationResult> {
    this.log(
      `Refundering registreret (ingen ekstern registrering): ` +
        `${order.orderNumber} · ${order.totalOre} øre · ${order.refundedAt}`
    );
    return { ok: true, mode: "none", reference: order.orderNumber };
  }

  /**
   * Ingen ekstern dagsafslutning at kalde. Returnerer et tomt resultat frem for
   * at kaste, så en dagsafslutning i baren ikke vælter på noget, huset ikke
   * bruger. Tallene hentes fra ordretabellen, ikke herfra.
   */
  async closeBusinessDay(eventId: string): Promise<DailyCloseResult> {
    return { eventId, paidCount: 0, grossOre: 0, refundedOre: 0, netOre: 0 };
  }
}

/**
 * Bevaret krog til et eksternt kassesystem. Vælges kun med
 * SALES_REGISTRATION=live og fejler LUKKET, indtil en rigtig implementering
 * træder i stedet — så tilstanden aldrig kan vælges i den tro, at der
 * registreres noget.
 */
const NOT_CONFIGURED =
  "Lovpligtig salgsregistrering er ikke konfigureret. Livebetaling kan ikke gennemføres.";

export class UnconfiguredLiveSalesRegistration implements SalesRegistration {
  // async, så et kast bliver til en afvist promise (fejler lukket).
  async registerPaidOrder(_order: PaidOrder): Promise<RegistrationResult> {
    throw new SalesRegistrationError(NOT_CONFIGURED);
  }
  async registerRefund(_order: RefundedOrder): Promise<RegistrationResult> {
    throw new SalesRegistrationError(NOT_CONFIGURED);
  }
  async closeBusinessDay(_eventId: string): Promise<DailyCloseResult> {
    throw new SalesRegistrationError(NOT_CONFIGURED);
  }
}

/**
 * Den valgte tilstand. SALES_REGISTRATION vinder, når den er sat til en kendt
 * værdi; ellers afgøres den af driftstilstanden: "none" i live, "test" udenfor.
 * En ukendt værdi ignoreres bevidst frem for at kaste, så en slåfejl i Vercel
 * ikke lukker bordbestillingen ned.
 */
export function getSalesRegistrationMode(): SalesRegistrationMode {
  const configured = process.env.SALES_REGISTRATION;
  if (configured === "none" || configured === "test" || configured === "live") {
    return configured;
  }
  return isLiveMode() ? "none" : "test";
}

/** Vælger implementering ud fra tilstanden. */
export function getSalesRegistration(
  testSink?: (rows: string[]) => Promise<void> | void
): SalesRegistration {
  switch (getSalesRegistrationMode()) {
    case "live":
      return new UnconfiguredLiveSalesRegistration();
    case "test":
      return new TestSalesRegistration(testSink);
    case "none":
      return new NoSalesRegistration();
  }
}
