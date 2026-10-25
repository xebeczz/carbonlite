import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  History,
  PencilLine,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfidenceChip,
  ConfirmDialog,
  DemoBadge,
  DocumentTypeIcon,
  PageHeader,
  PageSkeleton,
  SectionHeader,
  StatusChip,
} from "../components/ui";
import { useApp } from "../context/AppContext";
import {
  ApiClientError,
  formatApiError,
  getRecord,
  mediaUrl,
  rejectRecord,
  reopenRecord,
  updateRecord,
  verifyRecord,
  type RecordEditPayload,
} from "../lib/api";
import {
  FIELD_LABELS,
  confidencePercent,
  formatDate,
  formatDateTime,
  formatPeriod,
  num,
} from "../lib/format";
import type {
  AuditLogEntry,
  DocType,
  DocumentInfo,
  FuelType,
  RecordInfo,
  UpdateRecordResponse,
  ValidationIssue,
  VerifyResponse,
} from "../lib/types";

interface FormState {
  doc_type: DocType;
  vendor: string;
  billing_period_start: string;
  billing_period_end: string;
  quantity: string;
  unit: string;
  amount: string;
  currency: string;
  fuel_type: FuelType | "";
  notes: string;
}

type Busy = "save" | "verify" | "reject" | "reopen" | null;

const DOC_TYPE_OPTIONS: Array<{ value: DocType; label: string; hint: string }> = [
  { value: "electricity_bill", label: "Electricity bill", hint: "Counts as Scope 2" },
  { value: "fuel_receipt", label: "Diesel or petrol receipt", hint: "Counts as Scope 1" },
  { value: "lpg_invoice", label: "LPG invoice", hint: "Counts as Scope 1" },
  { value: "unknown", label: "Not sure — needs classification", hint: "Cannot be counted" },
];

const UNIT_OPTIONS = ["kWh", "litre", "kg"];
const FUEL_OPTIONS: Array<{ value: FuelType; label: string }> = [
  { value: "diesel", label: "Diesel" },
  { value: "petrol", label: "Petrol" },
  { value: "lpg", label: "LPG" },
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
  "report.generated": "Report downloaded",
  "recommendation.generated": "Actions generated",
};

function toForm(record: RecordInfo): FormState {
  return {
    doc_type: record.document?.doc_type ?? "unknown",
    vendor: record.vendor ?? "",
    billing_period_start: record.billing_period_start?.slice(0, 10) ?? "",
    billing_period_end: record.billing_period_end?.slice(0, 10) ?? "",
    quantity: record.quantity === null ? "" : String(record.quantity),
    unit: record.unit ?? "",
    amount: record.amount === null ? "" : String(record.amount),
    currency: record.currency || "INR",
    fuel_type: record.fuel_type ?? "",
    notes: record.notes ?? "",
  };
}

function parseNumber(raw: string): number | null | undefined {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function FieldGroup({
  id,
  label,
  confidence,
  edited,
  children,
  hint,
}: {
  id: string;
  label: string;
  confidence: number | null | undefined;
  edited: boolean;
  children: ReactNode;
  hint?: string;
}) {
  const low = confidence !== undefined && confidence !== null && confidence < 0.75;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label
          htmlFor={id}
          className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          {label}
        </label>
        {edited && confidence === 1 ? (
          <span className="chip-leaf !py-0.5 text-[10px]">
            <Check className="h-3 w-3" /> Your edit
          </span>
        ) : confidence === undefined || confidence === null ? (
          <span className="text-[10px] text-ink-muted">Not read</span>
        ) : (
          <ConfidenceChip value={confidence} prefix="" />
        )}
      </div>
      <div
        className={clsx(
          low &&
            "[&_input]:border-clay/50 [&_input]:bg-[#fffaf2] [&_select]:border-clay/50 [&_select]:bg-[#fffaf2]",
        )}
      >
        {children}
      </div>
      {low ? (
        <p className="mt-1 flex items-start gap-1 text-[10px] font-medium leading-4 text-clay">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> Low confidence — check this against
          the document.
        </p>
      ) : hint ? (
        <p className="mt-1 text-[10px] leading-4 text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function DocumentPreview({ document }: { document: DocumentInfo }) {
  const [stage, setStage] = useState<"preview" | "original" | "broken">("preview");
  const isPdf = document.mime_type === "application/pdf";
  const previewUrl = mediaUrl(document.preview_url);
  const originalUrl = mediaUrl(document.file_url);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="h-4 w-4 shrink-0 text-leaf" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-forest">Original document</p>
            <p className="truncate text-[10px] text-ink-muted">{document.original_filename}</p>
          </div>
        </div>
        <a
          href={originalUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-quiet min-h-[32px] shrink-0 px-2 py-1 text-[11px]"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex h-[420px] items-center justify-center overflow-hidden bg-sand-deep/40 sm:h-[500px] lg:h-[560px]">
        {isPdf && stage !== "preview" ? (
          <iframe
            title={`Original document: ${document.original_filename}`}
            src={originalUrl}
            className="h-full w-full bg-white"
          />
        ) : stage === "broken" ? (
          <div className="px-6 text-center">
            <FileText className="mx-auto h-8 w-8 text-ink-muted" />
            <p className="mt-2 text-sm font-medium text-ink">Preview unavailable</p>
            <a
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-leaf hover:underline"
            >
              Open the original <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <img
            src={stage === "preview" ? previewUrl : originalUrl}
            alt={`Preview of ${document.original_filename}`}
            className="h-full w-full object-contain p-2"
            onError={() => setStage(stage === "preview" ? "original" : "broken")}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[10px] text-ink-muted">
        <span>{document.mime_type === "application/pdf" ? "PDF document" : "Photo of a document"}</span>
        <span>Uploaded {formatDateTime(document.uploaded_at)}</span>
      </div>
    </Card>
  );
}

function DocumentMeta({ document }: { document: DocumentInfo }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <DocumentTypeIcon docType={document.doc_type} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{document.doc_type_label}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-ink-muted">
              Read with {document.extraction_method_label.toLowerCase()} · uploaded{" "}
              {formatDateTime(document.uploaded_at)}
            </p>
          </div>
        </div>
        <StatusChip status={document.status} />
      </div>
      {document.extraction_error ? (
        <Alert tone="warning" className="mt-3" title="Reader note">
          <p>{document.extraction_error}</p>
        </Alert>
      ) : null}
    </Card>
  );
}

function ResultCard({ record }: { record: RecordInfo }) {
  const result = record.result;
  if (!result) {
    if (record.document?.status === "verified") {
      return (
        <Alert tone="warning" title="Verified, but not counted">
          This record is confirmed, but CarbonLite could not find a usable emission factor for its
          unit and category. Fix the unit or type, save again, and the engine will retry. No number
          is guessed.
        </Alert>
      );
    }
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-forest p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#cfe0d4]/80">
            Calculated by CarbonLite
          </p>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold">
            {result.scope_label} · {result.scope_full_label}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <span className="font-display text-4xl leading-none tracking-[-0.03em]">
            {num(result.tonnes_co2e, 3)}
          </span>
          <span className="pb-0.5 text-sm font-medium text-[#cfe0d4]">tonnes CO₂e</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-medium">
          <span className="rounded-full bg-white/10 px-2.5 py-1">{result.category_label}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">{result.data_quality_label}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">
            {result.calc_method === "spend_estimate" ? "Spend estimate" : "Activity-based"}
          </span>
        </div>
      </div>
      <div className="p-5">
        <p className="rounded-xl border border-line bg-sand/60 px-3.5 py-3 font-mono text-[11px] leading-5 text-ink-soft">
          {result.formula_text}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Factor used
            </dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {result.factor.value === null ? "—" : num(result.factor.value, 4)} kg CO₂e/
              {result.factor.unit}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Source
            </dt>
            <dd className="mt-0.5 text-ink-soft">
              {result.factor.source}
              {result.factor.source_version ? ` · ${result.factor.source_version}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Factor year / region
            </dt>
            <dd className="mt-0.5 text-ink-soft">
              {result.factor.year ?? "—"} · {result.factor.region || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Factor status
            </dt>
            <dd className="mt-1">
              <Badge tone={result.factor.status === "verified" ? "leaf" : "amber"}>
                {result.factor.status || "unknown"}
              </Badge>
            </dd>
          </div>
        </dl>
        {result.calc_method === "spend_estimate" ? (
          <Alert tone="warning" className="mt-4" title="Low-quality spend estimate">
            The bill did not include a usable quantity, so this was estimated from spend. Treat it
            as a rough indication, not a measured emission.
          </Alert>
        ) : null}
      </div>
    </Card>
  );
}

function auditIcon(action: string): LucideIcon {
  if (action === "emission.calculated") return Sparkles;
  if (action === "record.edited") return PencilLine;
  if (action === "document.verified") return ShieldCheck;
  if (action === "document.rejected") return X;
  if (action === "record.verify_blocked" || action === "emission.failed") return AlertTriangle;
  if (action === "document.reopened") return RotateCcw;
  return History;
}

function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return num(value, 4);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function summariseAudit(entry: AuditLogEntry): string | null {
  const before = entry.old_value as Record<string, unknown> | null;
  const after = entry.new_value as Record<string, unknown> | null;

  if (entry.action === "record.edited" && before && after) {
    const changed = Object.keys(after).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );
    if (changed.length > 0) {
      return changed
        .map((field) => `${FIELD_LABELS[field] ?? field}: ${auditValue(before[field])} → ${auditValue(after[field])}`)
        .join(" · ");
    }
  }
  if (entry.action === "emission.calculated" && after) {
    return `${auditValue(after.kg_co2e)} kg CO₂e · ${auditValue(after.formula)}`;
  }
  if (entry.action === "document.verified" && after) {
    const confidence = typeof after.confidence === "number" ? ` · ${confidencePercent(after.confidence)} confidence` : "";
    return `Counted: ${after.counted === false ? "no" : "yes"}${confidence}`;
  }
  if (entry.action === "record.verify_blocked" && after) {
    const issues = after.issues;
    if (Array.isArray(issues) && issues.length > 0) return issues.join(" ");
  }
  if (entry.action === "record.extracted" && after) {
    const method = after.method ? `Method: ${String(after.method)}` : null;
    const confidence =
      typeof after.overall_confidence === "number"
        ? `${confidencePercent(after.overall_confidence)} confidence`
        : null;
    return [method, confidence].filter(Boolean).join(" · ") || null;
  }
  if (entry.action === "document.uploaded" && after) {
    return after.method ? `Read with ${String(after.method)}` : null;
  }
  if (entry.action === "document.rejected" && after) {
    return "Excluded from totals, kept in the audit trail.";
  }
  if (entry.action === "document.reopened" && after) {
    return "Reopened for review.";
  }
  if (after?.status) return `Status: ${String(after.status)}`;
  if (after?.reason) return String(after.reason);
  return null;
}

export function RecordDetailPage() {
  const params = useParams();
  const recordId = Number(params.recordId);
  const validId = Number.isInteger(recordId) && recordId > 0;
  const { business, notify } = useApp();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["record", recordId],
    queryFn: () => getRecord(recordId),
    enabled: validId,
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [mobileTab, setMobileTab] = useState<"fields" | "document">("fields");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [verifyError, setVerifyError] = useState<{ message: string; issues: ValidationIssue[] } | null>(
    null,
  );
  const lastSync = useRef<string | null>(null);

  useEffect(() => {
    if (!query.data) return;
    if (dirty) return;
    const stamp = `${query.data.updated_at}|${query.data.document?.status}|${query.data.document?.doc_type}`;
    if (lastSync.current === stamp) return;
    lastSync.current = stamp;
    setForm(toForm(query.data));
  }, [query.data, dirty]);

  const record = query.data;
  const document = record?.document;
  const status = document?.status ?? "uploaded";
  const locked = status === "rejected";
  const pending = status === "uploaded" || status === "extracted";
  const isFuelDoc =
    form?.doc_type === "fuel_receipt" || form?.doc_type === "lpg_invoice" || form?.doc_type === "unknown";

  const issues = useMemo<ValidationIssue[]>(() => {
    if (verifyError && verifyError.issues.length > 0) return verifyError.issues;
    return record?.validation_warnings ?? [];
  }, [record?.validation_warnings, verifyError]);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const overallConfidence = record?.overall_confidence ?? null;

  if (!validId) {
    return (
      <div className="card p-6">
        <h1 className="section-title">That record link looks wrong</h1>
        <p className="mt-1 text-sm text-ink-soft">Record IDs are numbers. Go back and pick a record.</p>
        <Link to="/records" className="btn-secondary mt-4">
          Back to records
        </Link>
      </div>
    );
  }

  if (query.isLoading || (!form && !query.error)) return <PageSkeleton />;
  if (query.error) {
    return (
      <div className="card p-6">
        <h1 className="section-title">That record did not load</h1>
        <p className="mt-1 text-sm leading-6 text-ink-soft">{formatApiError(query.error)}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
          <Link to="/records" className="btn-quiet">
            Back to records
          </Link>
        </div>
      </div>
    );
  }

  if (!record || !document || !form) return null;

  const applyResponse = (response: UpdateRecordResponse | VerifyResponse) => {
    const merged: RecordInfo = {
      ...record,
      ...response.record,
      document: response.document,
    };
    lastSync.current = `${merged.updated_at}|${response.document.status}|${response.document.doc_type}`;
    queryClient.setQueryData<RecordInfo>(["record", recordId], merged);
    setForm(toForm(merged));
    setDirty(false);
    void queryClient.invalidateQueries({ queryKey: ["record", recordId] });
    if (business) {
      for (const key of ["records", "dashboard", "report", "recommendations"]) {
        void queryClient.invalidateQueries({ queryKey: [key, business.id] });
      }
    }
  };

  const handleMutationError = (error: unknown) => {
    if (error instanceof ApiClientError && error.issues && error.issues.length > 0) {
      setVerifyError({ message: error.message, issues: error.issues });
    }
    notify(formatApiError(error), "error");
    void queryClient.invalidateQueries({ queryKey: ["record", recordId] });
  };

  const buildPayload = (): RecordEditPayload | null => {
    if (!form) return null;
    const quantity = parseNumber(form.quantity);
    const amount = parseNumber(form.amount);
    if (quantity === undefined) {
      notify("Quantity must be a valid number, or left blank.", "error");
      return null;
    }
    if (amount === undefined) {
      notify("Amount must be a valid number, or left blank.", "error");
      return null;
    }
    return {
      doc_type: form.doc_type,
      vendor: form.vendor.trim() || null,
      billing_period_start: form.billing_period_start || null,
      billing_period_end: form.billing_period_end || null,
      quantity,
      unit: form.unit.trim() || null,
      amount,
      currency: form.currency.trim() || "INR",
      fuel_type: form.fuel_type || null,
      notes: form.notes.trim() || null,
    };
  };

  const persist = async (): Promise<UpdateRecordResponse | null> => {
    const payload = buildPayload();
    if (!payload) return null;
    const saved = await updateRecord(recordId, payload);
    applyResponse(saved);
    return saved;
  };

  const handleSave = async () => {
    setBusy("save");
    setVerifyError(null);
    try {
      const saved = await persist();
      if (saved) {
        notify(saved.message, saved.blocking ? "error" : "success");
      }
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = async () => {
    setBusy("verify");
    setVerifyError(null);
    try {
      if (dirty) {
        const saved = await persist();
        if (!saved) return;
        if (saved.blocking) {
          notify("Fix the blocking issues before confirming.", "error");
        }
      }
      const verified = await verifyRecord(recordId);
      applyResponse(verified);
      setVerifyError(null);
      notify(verified.message, verified.counted ? "success" : "info");
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy("reject");
    try {
      const rejected = await rejectRecord(recordId);
      applyResponse(rejected);
      setRejectOpen(false);
      setVerifyError(null);
      notify(rejected.message, "info");
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusy(null);
    }
  };

  const handleReopen = async () => {
    setBusy("reopen");
    setVerifyError(null);
    try {
      const reopened = await reopenRecord(recordId);
      applyResponse(reopened);
      notify(reopened.message, "success");
    } catch (error) {
      handleMutationError(error);
    } finally {
      setBusy(null);
    }
  };

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value } as FormState;
      if (field === "doc_type" && value === "electricity_bill") {
        next.fuel_type = "";
      }
      return next;
    });
    setDirty(true);
    setVerifyError(null);
  };

  const confidenceFor = (field: string): number | null | undefined =>
    record.field_confidence?.[field];

  const title = record.vendor || document.original_filename || "Document review";
  const backTo = pending ? "/verify" : "/records";
  const backLabel = pending ? "Back to review queue" : "Back to records";

  return (
    <div className="animate-rise">
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Link>

      <PageHeader
        eyebrow={pending ? "Step 2 · Human check" : "Record detail"}
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{document.doc_type_label}</span>
            <span className="text-ink-muted">·</span>
            <span>{formatPeriod(record.billing_period_start, record.billing_period_end)}</span>
            <span className="text-ink-muted">·</span>
            <span>{document.extraction_method_label}</span>
            {document.is_demo || business?.is_demo ? <DemoBadge /> : null}
          </span>
        }
        actions={
          <>
            <StatusChip status={status} />
            <a
              href={mediaUrl(document.file_url)}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary min-h-[38px] px-3 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Original
            </a>
          </>
        }
      />

      <div className="mb-4 flex rounded-xl border border-line bg-white p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("fields")}
          className={clsx(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
            mobileTab === "fields" ? "bg-forest text-white" : "text-ink-muted",
          )}
          aria-pressed={mobileTab === "fields"}
        >
          <PencilLine className="h-3.5 w-3.5" /> Extracted fields
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("document")}
          className={clsx(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
            mobileTab === "document" ? "bg-forest text-white" : "text-ink-muted",
          )}
          aria-pressed={mobileTab === "document"}
        >
          <FileText className="h-3.5 w-3.5" /> Original document
        </button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className={clsx("space-y-4", mobileTab === "fields" && "hidden lg:block")}>
          <DocumentPreview document={document} />
          <DocumentMeta document={document} />
        </div>

        <div className={clsx("space-y-4", mobileTab === "document" && "hidden lg:block")}>
          {status === "rejected" ? (
            <Alert
              tone="danger"
              title="Rejected — excluded from your footprint"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RotateCcw}
                  loading={busy === "reopen"}
                  onClick={() => void handleReopen()}
                >
                  Reopen
                </Button>
              }
            >
              This document stays in the audit trail but is not counted. Reopen it if the rejection
              was a mistake.
            </Alert>
          ) : status === "verified" ? (
            <Alert tone="success" title="Confirmed and counted">
              This record is included in your footprint. Editing any field will recalculate it; if
              an edit creates a blocking issue, it is removed from totals until fixed.
            </Alert>
          ) : (
            <Alert tone="warning" title="Not counted yet">
              Nothing here counts until you confirm. Compare each field with the original document,
              fix anything wrong, then choose <strong>Confirm &amp; count</strong>.
            </Alert>
          )}

          {errors.length > 0 ? (
            <Alert
              tone="danger"
              title={verifyError?.message || `${errors.length} blocking issue${errors.length === 1 ? "" : "s"}`}
            >
              <ul className="mt-1 space-y-1">
                {errors.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="flex gap-1.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-danger" />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </Alert>
          ) : verifyError ? (
            <Alert tone="danger" title={verifyError.message} />
          ) : null}

          {warnings.length > 0 ? (
            <Alert tone="warning" title="Warnings — review, but not blocking">
              <ul className="mt-1 space-y-1">
                {warnings.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="flex gap-1.5">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-clay" />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {overallConfidence !== null && overallConfidence < 0.75 && !record.user_edited ? (
            <Alert tone="warning" title="The reader was not confident">
              Overall confidence is {confidencePercent(overallConfidence)}. Fields below 75% are
              highlighted below. Check them against the original before confirming.
            </Alert>
          ) : null}

          <ResultCard record={record} />

          <Card className="p-5">
            <SectionHeader
              title="Extracted fields"
              description="Edit anything the reader got wrong. The values you see are what the calculation will use."
              action={
                record.user_edited ? (
                  <span className="chip-leaf">
                    <Check className="h-3 w-3" /> Edited by you
                  </span>
                ) : null
              }
            />

            <div className="space-y-4">
              <FieldGroup
                id="doc-type"
                label="Document type"
                confidence={confidenceFor("document_type")}
                edited={record.user_edited}
                hint={DOC_TYPE_OPTIONS.find((option) => option.value === form.doc_type)?.hint}
              >
                <select
                  id="doc-type"
                  className="select"
                  value={form.doc_type}
                  onChange={(event) => setField("doc_type", event.target.value)}
                  disabled={locked}
                >
                  {DOC_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              <FieldGroup
                id="vendor"
                label="Vendor"
                confidence={confidenceFor("vendor")}
                edited={record.user_edited}
              >
                <input
                  id="vendor"
                  className="input"
                  value={form.vendor}
                  onChange={(event) => setField("vendor", event.target.value)}
                  placeholder="e.g. TANGEDCO or Sri Balaji Fuels"
                  disabled={locked}
                />
              </FieldGroup>

              <div className="grid grid-cols-2 gap-3">
                <FieldGroup
                  id="period-start"
                  label="Period start"
                  confidence={confidenceFor("billing_period_start")}
                  edited={record.user_edited}
                >
                  <input
                    id="period-start"
                    type="date"
                    className="input"
                    value={form.billing_period_start}
                    onChange={(event) => setField("billing_period_start", event.target.value)}
                    disabled={locked}
                  />
                </FieldGroup>
                <FieldGroup
                  id="period-end"
                  label="Period end"
                  confidence={confidenceFor("billing_period_end")}
                  edited={record.user_edited}
                >
                  <input
                    id="period-end"
                    type="date"
                    className="input"
                    value={form.billing_period_end}
                    onChange={(event) => setField("billing_period_end", event.target.value)}
                    disabled={locked}
                  />
                </FieldGroup>
              </div>

              <div className="grid grid-cols-[1.2fr_1fr] gap-3">
                <FieldGroup
                  id="quantity"
                  label="Quantity consumed"
                  confidence={confidenceFor("quantity")}
                  edited={record.user_edited}
                  hint="Electricity in kWh, fuel in litres, LPG in kg."
                >
                  <input
                    id="quantity"
                    className="input"
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={(event) => setField("quantity", event.target.value)}
                    placeholder="e.g. 18420"
                    disabled={locked}
                  />
                </FieldGroup>
                <FieldGroup
                  id="unit"
                  label="Unit"
                  confidence={confidenceFor("unit")}
                  edited={record.user_edited}
                >
                  <input
                    id="unit"
                    className="input"
                    list="carbonlite-units"
                    value={form.unit}
                    onChange={(event) => setField("unit", event.target.value)}
                    placeholder="kWh"
                    disabled={locked}
                  />
                  <datalist id="carbonlite-units">
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit} />
                    ))}
                  </datalist>
                </FieldGroup>
              </div>

              <div className={clsx("grid gap-3", isFuelDoc && "grid-cols-2")}>
                {isFuelDoc ? (
                  <FieldGroup
                    id="fuel-type"
                    label="Fuel type"
                    confidence={confidenceFor("fuel_type")}
                    edited={record.user_edited}
                  >
                    <select
                      id="fuel-type"
                      className="select"
                      value={form.fuel_type}
                      onChange={(event) => setField("fuel_type", event.target.value)}
                      disabled={locked}
                    >
                      <option value="">Select fuel</option>
                      {FUEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FieldGroup>
                ) : null}
                <FieldGroup
                  id="amount"
                  label="Bill amount"
                  confidence={confidenceFor("amount")}
                  edited={record.user_edited}
                  hint="Optional. Used only for the spend-based fallback."
                >
                  <div className="flex gap-2">
                    <input
                      id="amount"
                      className="input min-w-0 flex-1"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) => setField("amount", event.target.value)}
                      placeholder="e.g. 152000"
                      disabled={locked}
                    />
                    <input
                      aria-label="Currency"
                      className="input w-[76px] px-2 text-center text-xs font-semibold uppercase"
                      value={form.currency}
                      onChange={(event) => setField("currency", event.target.value.toUpperCase())}
                      maxLength={8}
                      disabled={locked}
                    />
                  </div>
                </FieldGroup>
              </div>

              <FieldGroup
                id="notes"
                label="Notes"
                confidence={confidenceFor("notes")}
                edited={record.user_edited}
              >
                <textarea
                  id="notes"
                  className="input min-h-[84px] resize-y"
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  placeholder="Anything a reviewer should know about this document."
                  disabled={locked}
                />
              </FieldGroup>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              {locked ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-muted">
                    Reopen this document to edit and count it again.
                  </p>
                  <Button
                    variant="secondary"
                    icon={RotateCcw}
                    loading={busy === "reopen"}
                    onClick={() => void handleReopen()}
                  >
                    Reopen for review
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    className="flex-1"
                    icon={status === "verified" ? Save : ShieldCheck}
                    loading={status === "verified" ? busy === "save" : busy === "verify"}
                    disabled={busy !== null || (status === "verified" && !dirty)}
                    onClick={() => void (status === "verified" ? handleSave() : handleConfirm())}
                  >
                    {status === "verified" ? "Save changes & recalculate" : "Confirm & count"}
                  </Button>
                  {status !== "verified" ? (
                    <Button
                      variant="secondary"
                      icon={Save}
                      loading={busy === "save"}
                      disabled={busy !== null || !dirty}
                      onClick={() => void handleSave()}
                      className="flex-1"
                    >
                      Save changes
                    </Button>
                  ) : null}
                </div>
              )}
              {!locked ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] leading-4 text-ink-muted">
                    {dirty
                      ? "Unsaved edits. Confirm also saves if your edits are valid."
                      : "Confirming stores the record, its factor and formula in the audit trail."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRejectOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-danger transition hover:bg-danger/5"
                  >
                    <X className="h-3.5 w-3.5" /> Reject this document
                  </button>
                </div>
              ) : null}
            </div>
          </Card>

          <Alert tone="info" title="How the number is made">
            The reader only extracts fields. A deterministic Python engine multiplies your quantity
            by a stored factor. Every value, source, year, and formula above is captured for audit —
            nothing is estimated by an AI.
          </Alert>
        </div>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <History className="h-4 w-4 text-leaf" /> Audit trail
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Everything that happened to this record, in order, including your edits.
            </p>
          </div>
          <span className="chip-neutral">
            {(record.audit_logs ?? []).length} event{(record.audit_logs ?? []).length === 1 ? "" : "s"}
          </span>
        </div>
        {(record.audit_logs ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">No audit entries yet.</p>
        ) : (
          <ol className="divide-y divide-line">
            {(record.audit_logs ?? []).map((entry) => {
              const Icon = auditIcon(entry.action);
              const summary = summariseAudit(entry);
              const tone =
                entry.action === "record.verify_blocked" || entry.action === "emission.failed"
                  ? "bg-[#fbeceb] text-danger"
                  : entry.action === "document.rejected"
                    ? "bg-sand-deep text-ink-muted"
                    : "bg-leaf-pale text-leaf";
              return (
                <li key={entry.id} className="flex gap-3 px-5 py-3.5">
                  <span className={clsx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-sm font-medium text-ink">
                        {AUDIT_LABELS[entry.action] ?? entry.action}
                      </p>
                      <span className="text-[10px] text-ink-muted">{formatDateTime(entry.timestamp)}</span>
                    </div>
                    {summary ? (
                      <p className="mt-0.5 break-words text-[11px] leading-5 text-ink-muted">{summary}</p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-ink-muted">
                      by {entry.actor === "demo-seed" || entry.actor === "demo" ? "demo seed" : entry.actor}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span>
          Source document uploaded {formatDate(record.document?.uploaded_at)} ·{" "}
          {record.document?.original_filename}
        </span>
        <span>Record #{record.id}</span>
      </div>

      <ConfirmDialog
        open={rejectOpen}
        title="Reject this document?"
        description={
          <>
            The document will stay in your records and audit trail, but it will not count towards
            your footprint. You can reopen it later.
            {status === "verified" ? " It is currently counted, so this will remove it from totals." : ""}
          </>
        }
        confirmLabel="Reject document"
        tone="danger"
        loading={busy === "reject"}
        onConfirm={() => void handleReject()}
        onClose={() => {
          if (busy !== "reject") setRejectOpen(false);
        }}
      />
    </div>
  );
}
