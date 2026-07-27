// Grænseflade til husets lovpligtige digitale salgsregistrering.
//
// Kassesystemet er endnu ikke afklaret. Derfor:
//  - I TESTTILSTAND (TABLE_ORDERING_LIVE=false) registreres salg som testdata
//    (CSV/spejling til intern kontrol) — dette er IKKE en godkendt
//    produktionsløsning.
//  - I LIVE-TILSTAND fejler modulet LUKKET, indtil et lovligt
//    salgsregistreringssystem er koblet på. Ingen livebetaling må registreres
//    "løst" og efterregistreres manuelt.
//
// Når kassesystemet er valgt, tilføjes en LiveSalesRegistration-implementering,
// der registrerer betalingen korrekt, gemmer transaktions-ID og håndterer moms
// og refundering.

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

export interface RegistrationResult {
  ok: boolean;
  mode: "test" | "live";
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
 * Live-tilstand uden konfigureret system: fejler LUKKET. Så snart et lovligt
 * kassesystem er valgt, erstattes denne af en rigtig implementering.
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
 * Vælger implementering ud fra tilstand. I live-tilstand returneres den
 * fail-closed-implementering, indtil et rigtigt system er koblet på.
 */
export function getSalesRegistration(
  testSink?: (rows: string[]) => Promise<void> | void
): SalesRegistration {
  if (isLiveMode()) {
    return new UnconfiguredLiveSalesRegistration();
  }
  return new TestSalesRegistration(testSink);
}
