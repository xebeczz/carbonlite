import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowRight,
  ChevronDown,
  History,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  ConfidenceChip,
  DocumentTypeIcon,
  EmptyState,
  ErrorPanel,
  PageHeader,
  PageSkeleton,
  StatusChip,
} from "../components/ui";
import { useApp } from "../context/AppContext";
import { getBusinessAudit, listRecords } from "../lib/api";
import {
  formatDateTime,
  formatPeriod,
  num,
  percent,
  pluralize,
  relativeDate,
  tonnes,
  unitLabel,
} from "../lib/format";
import type { RecordInfo } from "../lib/types";

type Filter = "all" | "pending" | "verified" | "rejected" | "uploaded" | "extracted";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Needs review" },
  { key: "verified", label: "Counted" },
  { key: "rejected", label: "Rejected" },
];

const AUDIT_LABELS: Record<string, string> = {
  "business.created": "Business created",
  "document.uploaded": "Document uploaded",
  "document.verified": "Record confirmed",
  "document.rejected": "Document rejected",
  "document.reopened": "Document reopened",
  "document.status_changed": "Status changed",
  "record.extracted": "Fields read",
  "record.edited": "Fields edited",
  "record.verify_blocked": "Confirmation blocked",
  "emission.calculated": "Emission calculated",
  "emission.failed": "Calculation failed",
  "emissions.recalculated": "All emissions recalculated",
  "report.pdf_generated": "PDF report downloaded",
  "report.csv_generated": "CSV report downloaded",
  "recommendations.generated": "Actions generated",
};

function matchesFilter(record: RecordInfo, filter: Filter): boolean {
  const status = record.document?.status ?? "uploaded";
  if (filter === "all") return true;
  if (filter === "pending") return status === "uploaded" || status === "extracted";
  return status === filter;
}

export function RecordsPage() {
  const { business } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showAudit, setShowAudit] = useState(false);

  const query = useQuery({
    queryKey: ["records", business?.id],
    queryFn: () => listRecords(business!.id),
    enabled: Boolean(business),
  });
  const auditQuery = useQuery({
    queryKey: ["business-audit", business?.id],
    queryFn: () => getBusinessAudit(business!.id, 40),
    enabled: Boolean(business) && showAudit,
  });

  const records = query.data ?? [];
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) => {
      const haystack = [
        record.vendor,
        record.document?.original_filename,
        record.document?.doc_type_label,
        record.fuel_type_label,
        record.billing_period_start,
        record.billing_period_end,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [records, search]);

  const filtered = searched.filter((record) => matchesFilter(record, filter));
  const counts = {
    all: records.length,
    pending: records.filter((record) => matchesFilter(record, "pending")).length,
    verified: records.filter((record) => matchesFilter(record, "verified")).length,
    rejected: records.filter((record) => matchesFilter(record, "rejected")).length,
  };
  const countedKg = records.reduce(
    (sum, record) => (record.document?.status === "verified" ? sum + (record.result?.kg_co2e ?? 0) : sum),
    0,
  );
  const lowConfidence = records.filter(
    (record) =>
      (record.document?.status === "uploaded" || record.document?.status === "extracted") &&
      (record.overall_confidence ?? 1) < 0.75,
  ).length;

  if (!business) return null;
  if (query.isLoading) return <PageSkeleton />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Audit trail"
        title="Every record, every source"
        description="Every document you have added, what was extracted, and whether it counts. Open a record to compare the fields with the original and view its full history."
        actions={
          <Link to="/upload" className="btn-primary">
            <UploadCloud className="h-4 w-4" /> Add a bill
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Documents
          </p>
          <p className="mt-1 text-2xl font-semibold text-forest">{counts.all}</p>
          <p className="text-[10px] text-ink-muted">in the register</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Counted emissions
          </p>
          <p className="mt-1 text-2xl font-semibold text-forest">
            {tonnes(countedKg, 2)}
            <span className="ml-1 text-xs font-normal text-ink-muted">t</span>
          </p>
          <p className="text-[10px] text-ink-muted">from verified records</p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Needs review
          </p>
          <p className="mt-1 text-2xl font-semibold text-clay">{counts.pending}</p>
          <p className="text-[10px] text-ink-muted">
            {lowConfidence > 0 ? `${lowConfidence} low-confidence` : "not in totals yet"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Rejected
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink-soft">{counts.rejected}</p>
          <p className="text-[10px] text-ink-muted">kept in the audit trail</p>
        </div>
      </div>

      <div className="card mb-4 p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted/70" />
            <input
              className="input pl-9"
              placeholder="Search vendor, file, or period"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search records"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2.5 rounded-md p-1 text-ink-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((item) => {
              const count =
                item.key === "all"
                  ? counts.all
                  : item.key === "pending"
                    ? counts.pending
                    : item.key === "verified"
                      ? counts.verified
                      : counts.rejected;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                    filter === item.key
                      ? "bg-forest text-white"
                      : "bg-sand text-ink-soft hover:bg-sand-deep",
                  )}
                  aria-pressed={filter === item.key}
                >
                  {item.label}
                  <span
                    className={clsx(
                      "rounded-full px-1.5 py-0.5 text-[9px]",
                      filter === item.key ? "bg-white/15" : "bg-white",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={UploadCloud}
            title="No documents yet"
            description="Your records will appear here with their extracted values, status, and audit history."
            action={
              <Link to="/upload" className="btn-primary">
                Add your first document
              </Link>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Search}
            title="No matching records"
            description="Try another search or filter. Filters only change the view; the underlying records stay untouched."
            action={
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setFilter("all");
                  setSearch("");
                }}
              >
                Clear filters
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-sand/60">
                <tr className="text-[10px] uppercase tracking-[0.08em] text-ink-muted">
                  <th className="px-4 py-3 font-semibold">Document</th>
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Quantity</th>
                  <th className="px-4 py-3 font-semibold">Scope / category</th>
                  <th className="px-4 py-3 text-right font-semibold">CO₂e</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((record) => {
                  const document = record.document;
                  return (
                    <tr key={record.id} className="group transition hover:bg-sand/50">
                      <td className="px-4 py-3">
                        <Link to={`/records/${record.id}`} className="flex items-center gap-3">
                          <DocumentTypeIcon docType={document?.doc_type} className="h-9 w-9" />
                          <div className="min-w-0">
                            <p className="max-w-[240px] truncate font-medium text-ink">
                              {record.vendor || document?.original_filename || "Unnamed document"}
                            </p>
                            <p className="text-[10px] text-ink-muted">
                              {document?.doc_type_label} · {relativeDate(document?.uploaded_at)}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {formatPeriod(record.billing_period_start, record.billing_period_end)}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink">
                        {record.quantity === null
                          ? "—"
                          : `${num(record.quantity, 2)} ${unitLabel(record.unit)}`}
                        {record.result?.calc_method === "spend_estimate" ? (
                          <span className="ml-1 rounded bg-[#fdf3e4] px-1 py-0.5 text-[9px] font-semibold text-clay">
                            spend
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {record.result ? (
                          <>
                            <p className="font-medium text-ink">{record.result.scope_label}</p>
                            <p className="text-[10px] text-ink-muted">{record.result.category_label}</p>
                          </>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-forest">
                        {record.result && document?.status === "verified"
                          ? `${tonnes(record.result.kg_co2e, 2)} t`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <StatusChip status={document?.status ?? "uploaded"} />
                          {document?.status !== "verified" && document?.status !== "rejected" ? (
                            <ConfidenceChip value={record.overall_confidence} prefix="" />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          to={`/records/${record.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted group-hover:bg-leaf-pale group-hover:text-leaf"
                          aria-label={`Open record ${record.id}`}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((record) => {
              const document = record.document;
              return (
                <Link key={record.id} to={`/records/${record.id}`} className="card block p-4">
                  <div className="flex items-start gap-3">
                    <DocumentTypeIcon docType={document?.doc_type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold text-ink">
                          {record.vendor || document?.original_filename || "Unnamed document"}
                        </p>
                        <StatusChip status={document?.status ?? "uploaded"} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {document?.doc_type_label} · {relativeDate(document?.uploaded_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="chip-neutral">
                          {record.quantity === null
                            ? "Quantity missing"
                            : `${num(record.quantity, 2)} ${unitLabel(record.unit)}`}
                        </span>
                        {record.result ? (
                          <span className="chip-leaf">
                            {tonnes(record.result.kg_co2e, 2)} t · {record.result.scope_label}
                          </span>
                        ) : null}
                        <ConfidenceChip value={record.overall_confidence} prefix="" />
                      </div>
                      <p className="mt-2 text-[10px] text-ink-muted">
                        {formatPeriod(record.billing_period_start, record.billing_period_end)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <div className="card mt-5 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAudit((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          aria-expanded={showAudit}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-leaf-pale text-leaf">
              <History className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-forest">Business activity</p>
              <p className="text-[11px] text-ink-muted">
                Uploads, edits, confirmations, rejections, and report downloads.
              </p>
            </div>
          </div>
          <ChevronDown
            className={clsx("h-4 w-4 shrink-0 text-ink-muted transition", showAudit && "rotate-180")}
          />
        </button>
        {showAudit ? (
          <div className="border-t border-line">
            {auditQuery.isLoading ? (
              <p className="px-5 py-5 text-xs text-ink-muted">Loading activity…</p>
            ) : auditQuery.error ? (
              <div className="px-5 py-4">
                <Alert tone="danger" title="Could not load activity">
                  Refresh the page to try again.
                </Alert>
              </div>
            ) : (auditQuery.data ?? []).length === 0 ? (
              <p className="px-5 py-5 text-xs text-ink-muted">No activity recorded yet.</p>
            ) : (
              <ol className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {(auditQuery.data ?? []).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-xs font-medium text-ink">
                          {AUDIT_LABELS[entry.action] ?? entry.action}
                        </p>
                        <span className="text-[10px] text-ink-muted">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-ink-muted">
                        {entry.entity} #{entry.entity_id} · by{" "}
                        {entry.actor === "demo-seed" || entry.actor === "demo" ? "demo seed" : entry.actor}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-center text-[10px] text-ink-muted">
        Showing {filtered.length} of {pluralize(records.length, "record")}.{" "}
        {counts.verified > 0
          ? `${percent((counts.verified / records.length) * 100)} counted.`
          : "Nothing counted yet."}
      </p>
    </div>
  );
}
