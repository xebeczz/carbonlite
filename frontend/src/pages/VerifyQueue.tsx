import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, UploadCloud } from "lucide-react";
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
import { listRecords } from "../lib/api";
import { formatPeriod, num, unitLabel } from "../lib/format";

export function VerifyQueuePage() {
  const { business, t } = useApp();
  const query = useQuery({
    queryKey: ["records", business?.id],
    queryFn: () => listRecords(business!.id),
    enabled: Boolean(business),
  });

  if (!business) return null;
  if (query.isLoading) return <PageSkeleton />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;

  const records = query.data ?? [];
  const pending = records.filter(
    (record) =>
      record.document?.status === "uploaded" || record.document?.status === "extracted",
  );
  const lowConfidence = pending.filter(
    (record) => (record.overall_confidence ?? 1) < 0.75,
  ).length;
  const counted = records.filter((record) => record.document?.status === "verified").slice(0, 4);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Step 2 · Human check"
        title={t("nav.verify")}
        description="Open each document, check the extracted fields against the source, then confirm. Only confirmed records count."
        actions={
          <Link to="/upload" className="btn-secondary">
            <UploadCloud className="h-4 w-4" /> Add more
          </Link>
        }
      />

      {pending.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CheckCircle2}
            title="All caught up"
            description="There are no documents waiting for review. Add another bill, or check your footprint on the dashboard."
            action={
              <>
                <Link to="/upload" className="btn-primary">
                  Upload a document
                </Link>
                <Link to="/dashboard" className="btn-secondary">
                  Open dashboard
                </Link>
              </>
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="chip-forest">{pending.length} waiting</span>
              {lowConfidence > 0 ? (
                <span className="chip-amber">
                  <AlertTriangle className="h-3 w-3" /> {lowConfidence} with low-confidence fields
                </span>
              ) : null}
              <span>Nothing here is counted yet.</span>
            </div>
          </div>

          <div className="space-y-3">
            {pending.map((record) => {
              const document = record.document;
              const errors = (record.validation_warnings || []).filter(
                (issue) => issue.severity === "error",
              );
              return (
                <Link
                  key={record.id}
                  to={`/records/${record.id}`}
                  className="card group flex flex-col gap-4 p-4 transition hover:border-leaf hover:shadow-lift sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <DocumentTypeIcon docType={document?.doc_type} className="h-11 w-11" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">
                          {record.vendor || document?.original_filename || "Unnamed document"}
                        </p>
                        <StatusChip status={document?.status ?? "uploaded"} />
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {document?.doc_type_label} ·{" "}
                        {formatPeriod(record.billing_period_start, record.billing_period_end)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="chip-neutral">
                          {record.quantity !== null
                            ? `${num(record.quantity, 2)} ${unitLabel(record.unit)}`
                            : "Quantity missing"}
                        </span>
                        <ConfidenceChip value={record.overall_confidence} />
                        {errors.length > 0 ? (
                          <span className="chip-danger">
                            <AlertTriangle className="h-3 w-3" /> {errors.length} blocking issue
                            {errors.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-3 sm:justify-end sm:border-0 sm:pt-0">
                    <span className="text-[11px] text-ink-muted sm:hidden">
                      {document?.extraction_method_label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-forest px-3.5 py-2 text-xs font-semibold text-white transition group-hover:bg-forest-deep">
                      Review <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {pending.length === 0 && counted.length > 0 ? (
        <div className="mt-6">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="section-title">Recently counted</h2>
                <p className="mt-0.5 text-xs text-ink-muted">Confirmed by you, with an audit trail.</p>
              </div>
              <Link to="/records" className="text-xs font-semibold text-leaf hover:underline">
                All records →
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {counted.map((record) => (
                <li key={record.id}>
                  <Link
                    to={`/records/${record.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-sand/60"
                  >
                    <CheckCircle2 className="h-4 w-4 text-leaf" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {record.vendor || record.document?.doc_type_label}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {record.document?.doc_type_label} ·{" "}
                        {formatPeriod(record.billing_period_start, record.billing_period_end)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-forest">
                      {record.result ? `${num(record.result.tonnes_co2e, 2)} t` : "Not counted"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <Alert tone="info" className="mt-5" title="Why a human check?">
        <p>
          The reader can be wrong. CarbonLite highlights fields below 75% confidence, but you
          should always compare the quantity and dates with the document before confirming.
        </p>
      </Alert>
    </div>
  );
}
