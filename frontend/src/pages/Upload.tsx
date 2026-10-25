import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  ScanLine,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  ConfidenceChip,
  DemoBadge,
  DocumentTypeIcon,
  EmptyState,
  PageHeader,
  SectionHeader,
} from "../components/ui";
import { useApp } from "../context/AppContext";
import {
  ApiClientError,
  fetchSampleAsFile,
  formatApiError,
  uploadDocument,
} from "../lib/api";
import { formatPeriod, num, unitLabel } from "../lib/format";
import type { SampleDocument, UploadResponse } from "../lib/types";

interface UploadItem {
  key: string;
  fileName: string;
  fileSize: number;
  sampleLabel?: string;
  status: "uploading" | "done" | "error";
  response?: UploadResponse;
  error?: string;
  duplicate?: boolean;
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
  const { business, meta, metaLoading, notify } = useApp();
  const queryClient = useQueryClient();
  const chooseRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sampleBusy, setSampleBusy] = useState<string | null>(null);

  if (!business) return null;

  const maxMb = meta?.limits.max_upload_mb ?? 15;
  const uploading = items.filter((item) => item.status === "uploading").length;
  const doneCount = items.filter((item) => item.status === "done").length;

  const invalidate = () => {
    for (const key of ["dashboard", "records", "report", "recommendations"]) {
      void queryClient.invalidateQueries({ queryKey: [key, business.id] });
    }
  };

  const updateItem = (key: string, patch: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  };

  const addFiles = async (files: File[], sampleLabel?: string) => {
    const prepared = files.filter((file) => {
      if (file.size > maxMb * 1024 * 1024) {
        notify(`${file.name} is larger than ${maxMb} MB. Try a smaller photo or PDF.`, "error");
        return false;
      }
      return true;
    });
    if (prepared.length === 0) return;

    const batch: UploadItem[] = prepared.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      fileName: file.name,
      fileSize: file.size,
      sampleLabel,
      status: "uploading",
    }));
    setItems((current) => [...batch, ...current]);

    for (let index = 0; index < prepared.length; index += 1) {
      const item = batch[index];
      try {
        const response = await uploadDocument(business.id, prepared[index]);
        updateItem(item.key, { status: "done", response });
        invalidate();
        const label =
          response.record.quantity !== null
            ? `${num(response.record.quantity, 2)} ${unitLabel(response.record.unit)} read`
            : "Document saved — fields need your help";
        notify(`${prepared[index].name}: ${label}.`, "success");
      } catch (error) {
        const duplicate =
          error instanceof ApiClientError && error.code === "duplicate_file";
        updateItem(item.key, {
          status: "error",
          error: formatApiError(error),
          duplicate,
        });
        if (!duplicate) notify(formatApiError(error), "error");
      }
    }
  };

  const onPick = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    await addFiles(Array.from(fileList));
    if (chooseRef.current) chooseRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      await onPick(event.dataTransfer.files);
    }
  };

  const trySample = async (sample: SampleDocument) => {
    setSampleBusy(sample.kind);
    try {
      notify(`Loading ${sample.label}…`, "info");
      const file = await fetchSampleAsFile(sample);
      await addFiles([file], sample.label);
    } catch (error) {
      notify(formatApiError(error), "error");
    } finally {
      setSampleBusy(null);
    }
  };

  const capabilities = meta?.extraction;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Step 1 · Add data"
        title="Add bills and receipts"
        description={
          <>
            Upload electricity bills, diesel or petrol receipts, and LPG invoices. We read the
            fields; nothing is counted until you confirm it.
            {business.is_demo ? (
              <span className="ml-2 inline-flex align-middle">
                <DemoBadge />
              </span>
            ) : null}
          </>
        }
        actions={
          doneCount > 0 ? (
            <Link to="/verify" className="btn-primary">
              Review {doneCount} {doneCount === 1 ? "document" : "documents"}
            </Link>
          ) : null
        }
      />

      <div className="mb-5 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-semibold text-ink-muted">
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-forest px-3 py-1.5 text-white">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px]">1</span>
          Add documents
        </span>
        <span className="h-px w-5 bg-line" />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sand-deep text-[9px]">2</span>
          Confirm the fields
        </span>
        <span className="h-px w-5 bg-line" />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sand-deep text-[9px]">3</span>
          Calculate & report
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_0.8fr]">
        <div className="space-y-5">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={clsx(
              "card relative overflow-hidden border-dashed p-6 transition sm:p-8",
              dragging ? "border-leaf bg-leaf-pale/50" : "border-line",
            )}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-leaf-pale/80 blur-2xl" />
            <div className="relative flex flex-col items-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-forest text-white shadow-card">
                <UploadCloud className="h-7 w-7" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-forest">
                Drop a bill here, or use your camera
              </h2>
              <p className="mt-1.5 max-w-sm text-xs leading-6 text-ink-muted">
                PDF, JPG, PNG, or WebP · up to {maxMb} MB each. One bill per file works best.
              </p>
              <div className="mt-5 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
                <Button
                  icon={Camera}
                  onClick={() => cameraRef.current?.click()}
                  disabled={uploading > 0}
                >
                  Take a photo
                </Button>
                <Button
                  variant="secondary"
                  icon={FileText}
                  onClick={() => chooseRef.current?.click()}
                  disabled={uploading > 0}
                >
                  Choose files
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[10px] font-medium text-ink-muted">
                <span className="flex items-center gap-1 rounded-full bg-sand px-2.5 py-1">
                  <ImageIcon className="h-3 w-3" /> Phone photos
                </span>
                <span className="flex items-center gap-1 rounded-full bg-sand px-2.5 py-1">
                  <ScanLine className="h-3 w-3" /> PDF bills
                </span>
                <span className="flex items-center gap-1 rounded-full bg-sand px-2.5 py-1">
                  <LockKeyhole className="h-3 w-3" /> Private to your business
                </span>
              </div>

              <input
                ref={chooseRef}
                type="file"
                className="sr-only"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => void onPick(event.target.files)}
              />
              <input
                ref={cameraRef}
                type="file"
                className="sr-only"
                accept="image/*"
                capture="environment"
                onChange={(event) => void onPick(event.target.files)}
              />
            </div>
          </div>

          {meta?.samples?.some((sample) => sample.available) ? (
            <div className="card p-5">
              <SectionHeader
                title="No bill handy? Try a sample"
                description="Generated sample documents with clearly marked demo values. They work without an AI key."
                action={<Sparkles className="h-4 w-4 text-clay" />}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                {meta.samples
                  .filter((sample) => sample.available)
                  .map((sample) => (
                    <button
                      key={sample.kind}
                      type="button"
                      onClick={() => void trySample(sample)}
                      disabled={sampleBusy !== null}
                      className="group flex h-full flex-col rounded-xl border border-line bg-sand/50 p-3 text-left transition hover:border-leaf hover:bg-white disabled:opacity-60"
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-forest">{sample.label}</span>
                        {sampleBusy === sample.kind ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-leaf" />
                        ) : (
                          <UploadCloud className="h-3.5 w-3.5 text-ink-muted group-hover:text-leaf" />
                        )}
                      </span>
                      <span className="mt-1 text-[10px] leading-4 text-ink-muted">
                        {sample.description}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          {items.length > 0 ? (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <h2 className="section-title">This upload</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {uploading > 0
                      ? `Reading ${uploading} document${uploading === 1 ? "" : "s"}…`
                      : `${items.length} document${items.length === 1 ? "" : "s"} handled`}
                  </p>
                </div>
                {items.every((item) => item.status !== "uploading") ? (
                  <Link to="/verify" className="btn-secondary min-h-[38px] px-3 text-xs">
                    Review queue
                  </Link>
                ) : null}
              </div>
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const response = item.response;
                  const record = response?.record;
                  const manual = response?.extraction.manual_required;
                  return (
                    <li key={item.key} className="px-4 py-4 sm:px-5">
                      <div className="flex items-start gap-3">
                        {item.status === "uploading" ? (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand">
                            <Loader2 className="h-5 w-5 animate-spin text-leaf" />
                          </span>
                        ) : (
                          <DocumentTypeIcon docType={response?.document.doc_type} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <p className="min-w-0 truncate text-sm font-semibold text-ink">
                              {item.fileName}
                            </p>
                            <span className="text-[10px] text-ink-muted">{fileSizeLabel(item.fileSize)}</span>
                          </div>
                          {item.status === "uploading" ? (
                            <p className="mt-1 text-xs text-ink-muted">
                              {item.sampleLabel ? "Loading sample and reading fields…" : "Reading fields…"}
                            </p>
                          ) : null}
                          {item.status === "done" && response && record ? (
                            <>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                                <span className="font-medium">{response.document.doc_type_label}</span>
                                {record.vendor ? <span className="text-ink-muted">· {record.vendor}</span> : null}
                                {record.billing_period_start ? (
                                  <span className="text-ink-muted">
                                    · {formatPeriod(record.billing_period_start, record.billing_period_end)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <ConfidenceChip value={record.overall_confidence} />
                                <span className="chip-neutral">{response.extraction.method_label}</span>
                                {record.quantity !== null ? (
                                  <span className="chip-neutral">
                                    {num(record.quantity, 2)} {unitLabel(record.unit)}
                                  </span>
                                ) : (
                                  <span className="chip-amber">
                                    <AlertTriangle className="h-3 w-3" /> Fields missing
                                  </span>
                                )}
                                {manual ? <span className="chip-amber">Manual check needed</span> : null}
                              </div>
                              {response.extraction.warnings.length > 0 ? (
                                <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                                  {response.extraction.warnings[0]}
                                </p>
                              ) : null}
                              <div className="mt-2.5 flex flex-wrap gap-2">
                                <Link
                                  to={`/records/${record.id}`}
                                  className="btn-primary min-h-[34px] px-3 py-1.5 text-[11px]"
                                >
                                  Review & confirm
                                </Link>
                                <Link
                                  to={`/records/${record.id}`}
                                  className="btn-quiet min-h-[34px] px-2 py-1.5 text-[11px]"
                                >
                                  Enter manually
                                </Link>
                              </div>
                            </>
                          ) : null}
                          {item.status === "error" ? (
                            <div className="mt-1.5">
                              <p className="text-xs leading-5 text-danger">{item.error}</p>
                              {item.duplicate ? (
                                <Link
                                  to="/records"
                                  className="mt-2 inline-flex text-[11px] font-semibold text-leaf hover:underline"
                                >
                                  This file is already on record. View records →
                                </Link>
                              ) : (
                                <p className="mt-1 text-[10px] text-ink-muted">
                                  Try another file, or re-upload as a clear photo or PDF.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                        {item.status === "done" ? (
                          <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-leaf" />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <SectionHeader
              title="How reading works"
              description="The reader only extracts fields. It never calculates emissions."
            />
            <div className="space-y-3">
              {capabilities?.llm_configured ? (
                <div className="rounded-xl border border-leaf/15 bg-leaf-pale/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-forest">
                    <Sparkles className="h-3.5 w-3.5 text-leaf" /> AI reader is active
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-ink-soft">
                    Photos and PDFs use {capabilities.vision_model}. Text is read with{" "}
                    {capabilities.text_model}, with an offline fallback.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-clay/15 bg-[#fdf6ea] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-clay">
                    <AlertTriangle className="h-3.5 w-3.5" /> No AI key configured
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[#6f4a19]">
                    PDFs with a text layer use the offline reader. Phone photos need manual entry.
                    This is a graceful fallback, not a silent guess.
                  </p>
                </div>
              )}
              <div className="flex items-start gap-2 text-[11px] leading-5 text-ink-muted">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                Electricity bills: extract units consumed in kWh, not the rupee total.
              </div>
              <div className="flex items-start gap-2 text-[11px] leading-5 text-ink-muted">
                <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                Tamil and English documents are supported. Dates are read day-first.
              </div>
              <div className="flex items-start gap-2 text-[11px] leading-5 text-ink-muted">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                Duplicate files are blocked using a content hash, so a bill cannot be counted twice.
              </div>
            </div>
          </div>

          <Alert tone="info" title="What counts towards your footprint?">
            <p>
              Electricity is <strong>Scope 2</strong>. Diesel, petrol, and LPG burned on site are{" "}
              <strong>Scope 1</strong>. Scope 3 is deliberately out of scope in CarbonLite.
            </p>
          </Alert>

          {items.length === 0 ? (
            <div className="card-soft p-5">
              <p className="text-xs font-semibold text-forest">A clear bill works best</p>
              <ul className="mt-2 space-y-2 text-[11px] leading-5 text-ink-muted">
                <li>· Keep the vendor and billing period visible.</li>
                <li>· For electricity, make sure the meter reading and units consumed are in frame.</li>
                <li>· For fuel, capture the litres and fuel type.</li>
                <li>· For LPG, capture the kilograms, not just the cylinder count.</li>
              </ul>
            </div>
          ) : (
            <div className="card-soft p-5">
              <p className="text-xs font-semibold text-forest">
                {doneCount > 0 ? "Ready for your review" : "Reading your documents"}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                Every extracted field shows a confidence chip. Verify anything below 75% before
                confirming. You remain in control of what counts.
              </p>
              {doneCount > 0 && uploading === 0 ? (
                <Link to="/verify" className="btn-primary mt-4 w-full">
                  Review {doneCount} document{doneCount === 1 ? "" : "s"}
                </Link>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={UploadCloud}
          title="Your documents will appear here"
          description="Add a bill above or try a sample. The sample PDFs are read by the offline reader even without an AI key."
        />
      ) : null}

      {metaLoading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading reader settings…
        </p>
      ) : null}
    </div>
  );
}
