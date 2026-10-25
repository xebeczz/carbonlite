export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function tonnes(kg: number | null | undefined, digits = 2): string {
  if (kg === null || kg === undefined) return "—";
  return num(kg / 1000, digits);
}

export function inr(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return "—";
  if (compact) {
    if (value >= 10_000_000) return `₹${num(value / 10_000_000, 2)} Cr`;
    if (value >= 100_000) return `₹${num(value / 100_000, 2)} L`;
    if (value >= 1_000) return `₹${num(value / 1_000, 1)}k`;
  }
  return `₹${num(value, 0)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export function formatPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "Billing period missing";
  if (start && end && start === end) return formatDate(start);
  return `${formatDate(start)} → ${formatDate(end)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${num(value, digits)}%`;
}

export function confidencePercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${num(count)} ${count === 1 ? singular : plural || `${singular}s`}`;
}

export function relativeDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const days = Math.round(diff / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

export const FIELD_LABELS: Record<string, string> = {
  document_type: "Document type",
  vendor: "Vendor",
  billing_period_start: "Period start",
  billing_period_end: "Period end",
  quantity: "Quantity",
  unit: "Unit",
  amount: "Amount",
  fuel_type: "Fuel type",
};

export const DOC_TYPE_SHORT: Record<string, string> = {
  electricity_bill: "Electricity",
  fuel_receipt: "Fuel",
  lpg_invoice: "LPG",
  unknown: "Unclassified",
};

export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return "—";
  if (unit.toLowerCase() === "litre") return "litres";
  return unit;
}

export function qualityLabel(value: string | null | undefined): string {
  if (value === "high") return "High quality";
  if (value === "medium") return "Medium quality";
  if (value === "low") return "Low quality";
  return "—";
}
