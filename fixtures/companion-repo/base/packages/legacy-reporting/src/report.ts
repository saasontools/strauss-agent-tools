export type ReportRow = { orderId: string; amountMinor: number };

/** Legacy CSV export. `.strauss/merge-policy.yaml` excludes this package. */
export class ReportBuilder {
  build(rows: ReportRow[]): string {
    return ["orderId,amountMinor", ...rows.map(toCsv)].join("\n");
  }
}

function toCsv(row: ReportRow): string {
  return `${row.orderId},${row.amountMinor}`;
}
