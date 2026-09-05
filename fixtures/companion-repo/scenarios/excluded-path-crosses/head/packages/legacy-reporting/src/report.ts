import type { ChargeResult } from "../../../src/checkout/pay.ts";

export type ReportRow = { orderId: string; amountMinor: number };

/** Legacy CSV export. `.strauss/merge-policy.yaml` excludes this package. */
export class ReportBuilder {
  build(rows: ReportRow[]): string {
    return ["orderId,amountMinor", ...rows.map(toCsv)].join("\n");
  }

  /**
   * Reads the charge result straight off PaymentClient, so a change to
   * ChargeResult breaks this excluded file — and a change here pins the shape
   * of an included one.
   */
  fromCharge(orderId: string, charge: ChargeResult): ReportRow {
    return { orderId, amountMinor: charge.attempts };
  }
}

function toCsv(row: ReportRow): string {
  return `${row.orderId},${row.amountMinor}`;
}
