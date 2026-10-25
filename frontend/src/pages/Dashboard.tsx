import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FlaskConical,
  Leaf,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CategoryBars, MonthlyBarChart, ScopeDonut } from "../components/charts";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfidenceChip,
  DemoBadge,
  DocumentTypeIcon,
  EmptyState,
  ErrorPanel,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  ScoreRing,
  SectionHeader,
  StatusChip,
} from "../components/ui";
import { useApp } from "../context/AppContext";
import { formatApiError, getDashboard, recalculate } from "../lib/api";
import {
  formatDate,
  inr,
  num,
  percent,
  pluralize,
  relativeDate,
  tonnes,
} from "../lib/format";

export function DashboardPage() {
  const { business, notify } = useApp();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["dashboard", business?.id],
    queryFn: () => getDashboard(business!.id),
    enabled: Boolean(business),
  });

  const recalc = useMutation({
    mutationFn: () => recalculate(business!.id),
    onSuccess: (result) => {
      notify(result.message, result.errors.length > 0 ? "info" : "success");
      queryClient.invalidateQueries({ queryKey: ["dashboard", business?.id] });
      queryClient.invalidateQueries({ queryKey: ["records", business?.id] });
      queryClient.invalidateQueries({ queryKey: ["report", business?.id] });
      queryClient.invalidateQueries({ queryKey: ["recommendations", business?.id] });
    },
    onError: (error) => notify(formatApiError(error), "error"),
  });

  if (!business) return null;
  if (query.isLoading) return <PageSkeleton />;
  if (query.error) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }
  const data = query.data;
  if (!data) return null;

  const scope1 = data.by_scope.find((row) => row.scope === 1);
  const scope2 = data.by_scope.find((row) => row.scope === 2);
  const pending = data.pending_documents;
  const hasRecords = data.totals.record_count > 0;
  const hasDocuments = data.quality.total_documents > 0;
  const topEmitter = data.totals.top_emitter;
  const qualityMix = data.quality.mix;
  const qualityTotal = qualityMix.high + qualityMix.medium + qualityMix.low;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Your reporting period"
        title="Your carbon footprint"
        description={
          <>
            {data.business.name} · {formatDate(data.business.reporting_period_start)} →{" "}
            {formatDate(data.business.reporting_period_end)} · Scope 1 and 2 only.
            {data.demo ? (
              <span className="ml-2 inline-flex align-middle">
                <DemoBadge />
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Link to="/upload" className="btn-primary">
              <UploadCloud className="h-4 w-4" /> Add a bill
            </Link>
            <Link to="/report" className="btn-secondary">
              <FileDown className="h-4 w-4" /> Report
            </Link>
          </>
        }
      />

      {data.factor_status.has_unverified ? (
        <Alert
          tone="danger"
          className="mb-4"
          title="Reports are blocked: a used factor is still VERIFY_ME"
          action={
            <Link to="/factors" className="btn-secondary min-h-[36px] px-3 text-xs">
              Review factors
            </Link>
          }
        >
          <p>{data.factor_status.notice}</p>
        </Alert>
      ) : data.factor_status.has_demo ? (
        <Alert
          tone="warning"
          className="mb-4"
          title="Illustrative factor values"
          action={
            <Link to="/factors" className="btn-secondary min-h-[36px] px-3 text-xs">
              See sources
            </Link>
          }
        >
          <p>{data.factor_status.notice}</p>
        </Alert>
      ) : null}

      {data.calculation_errors.length > 0 ? (
        <Alert tone="danger" className="mb-4" title="Some confirmed records are not counted">
          <ul className="space-y-1">
            {data.calculation_errors.map((error) => (
              <li key={error.document_id}>
                {error.record_id ? (
                  <Link
                    to={`/records/${error.record_id}`}
                    className="font-semibold underline underline-offset-2"
                  >
                    {error.vendor || `Record #${error.record_id}`}
                  </Link>
                ) : (
                  <span>Document #{error.document_id}</span>
                )}{" "}
                — {error.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {pending > 0 ? (
        <Alert
          tone="info"
          className="mb-4"
          title={`${pluralize(pending, "document")} waiting for your review`}
          action={
            <Link to="/verify" className="btn-primary min-h-[36px] px-3 text-xs">
              <ClipboardCheck className="h-3.5 w-3.5" /> Review now
            </Link>
          }
        >
          <p>They are not in these totals until you check the fields and confirm them.</p>
        </Alert>
      ) : null}

      {!hasDocuments ? (
        <Card className="mb-5">
          <EmptyState
            icon={UploadCloud}
            title="Your footprint starts with one bill"
            description="Add an electricity bill, a diesel or petrol receipt, or an LPG invoice. The reader extracts the fields; you confirm them; the engine does the math."
            action={
              <>
                <Link to="/upload" className="btn-primary">
                  Add your first document
                </Link>
                <Link to="/verify" className="btn-secondary">
                  See the review queue
                </Link>
              </>
            }
          />
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.8fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="grid sm:grid-cols-[1.15fr_0.85fr]">
              <div className="relative overflow-hidden bg-forest p-5 text-white sm:p-6">
                <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-white/[0.06]" />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#cfe0d4]/70">
                      Counted emissions
                    </p>
                    {data.demo ? (
                      <span className="rounded-full border border-[#f2c94c]/25 bg-[#f2c94c]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#f2c94c]">
                        Demo
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <span className="font-display text-5xl leading-none tracking-[-0.035em]">
                      {tonnes(data.totals.kg_co2e)}
                    </span>
                    <span className="pb-1 text-sm font-medium text-[#cfe0d4]">t CO₂e</span>
                  </div>
                  <p className="mt-3 text-xs text-[#cfe0d4]/70">
                    {hasRecords
                      ? `From ${pluralize(data.totals.record_count, "confirmed record")} · ${num(
                          data.totals.kg_co2e,
                          0,
                        )} kg CO₂e`
                      : "No confirmed records counted yet."}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
                      <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#cfe0d4]/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8fbfa4]" /> Electricity
                      </p>
                      <p className="mt-1 text-lg font-semibold">{tonnes(scope2?.kg_co2e ?? 0, 2)} t</p>
                      <p className="text-[10px] text-[#cfe0d4]/55">
                        Scope 2 · {percent(scope2?.share ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
                      <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#cfe0d4]/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#f2c94c]" /> Fuel
                      </p>
                      <p className="mt-1 text-lg font-semibold">{tonnes(scope1?.kg_co2e ?? 0, 2)} t</p>
                      <p className="text-[10px] text-[#cfe0d4]/55">
                        Scope 1 · {percent(scope1?.share ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to="/recommendations"
                      className="btn min-h-[36px] bg-white px-3 py-1.5 text-xs text-forest hover:bg-[#f1f4ee]"
                    >
                      <Leaf className="h-3.5 w-3.5" /> See actions
                    </Link>
                    <Link
                      to="/report"
                      className="btn min-h-[36px] border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                    >
                      <FileDown className="h-3.5 w-3.5" /> Buyer report
                    </Link>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Data quality
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-forest">
                      {data.quality.score}
                      <span className="text-sm font-normal text-ink-muted"> / 100</span>
                    </p>
                  </div>
                  <ScoreRing value={data.quality.score} label="Quality" size={76} />
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-ink-soft">Report completeness</span>
                    <span className="font-semibold text-forest">
                      {percent(data.quality.completeness_pct, 1)}
                    </span>
                  </div>
                  <ProgressBar value={data.quality.completeness_pct} className="mt-1.5" />
                  <p className="mt-1.5 text-[10px] leading-4 text-ink-muted">
                    {data.quality.verified_documents} of{" "}
                    {data.quality.total_documents - data.quality.rejected_documents} live documents
                    confirmed.
                  </p>
                </div>

                <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-leaf" /> High quality
                    </span>
                    <span className="font-semibold text-ink">{qualityMix.high}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-clay" /> Medium quality
                    </span>
                    <span className="font-semibold text-ink">{qualityMix.medium}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-ink-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Low quality
                    </span>
                    <span className="font-semibold text-ink">{qualityMix.low}</span>
                  </div>
                  {qualityTotal === 0 ? (
                    <p className="pt-1 text-[10px] text-ink-muted">
                      Quality is scored once records are counted.
                    </p>
                  ) : null}
                </div>

                {data.quality.spend_estimates > 0 ? (
                  <p className="mt-3 rounded-lg bg-[#fdf6ea] px-2.5 py-2 text-[10px] leading-4 text-[#6f4a19]">
                    {data.quality.spend_estimates} record
                    {data.quality.spend_estimates === 1 ? " uses" : "s use"} a low-quality spend
                    estimate.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <MonthlyBarChart data={data.monthly} />
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5">
              <SectionHeader
                title="By category"
                description="The activities behind your counted footprint."
              />
              <CategoryBars rows={data.by_category} />
            </Card>
            <Card className="p-5">
              <ScopeDonut byScope={data.by_scope} totalKg={data.totals.kg_co2e} />
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="section-title">Recent documents</h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Every number traces back to one of these.
                </p>
              </div>
              <Link to="/records" className="text-xs font-semibold text-leaf hover:underline">
                All records →
              </Link>
            </div>
            {data.recent_records.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">
                No documents yet.{" "}
                <Link to="/upload" className="font-semibold text-leaf hover:underline">
                  Add your first bill
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.recent_records.map((document) => {
                  const record = document.record;
                  const content = (
                    <>
                      <DocumentTypeIcon docType={document.doc_type} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-ink">
                            {record?.vendor || document.original_filename}
                          </p>
                          {document.is_demo ? <DemoBadge label="Demo" /> : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {document.doc_type_label} · {relativeDate(document.uploaded_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusChip status={document.status} />
                        {record?.result ? (
                          <span className="text-[10px] font-semibold text-ink-muted">
                            {tonnes(record.result.kg_co2e, 2)} t
                          </span>
                        ) : record ? (
                          <ConfidenceChip value={record.overall_confidence} />
                        ) : null}
                      </div>
                    </>
                  );
                  return (
                    <li key={document.id}>
                      {record ? (
                        <Link
                          to={`/records/${record.id}`}
                          className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-sand/60 sm:px-5"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <SectionHeader
              title="Next step"
              description="Keep the footprint complete and trustworthy."
            />
            {pending > 0 ? (
              <div className="rounded-xl border border-clay/20 bg-[#fdf6ea] p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[#6f4a19]">
                  <ClipboardCheck className="h-4 w-4 text-clay" /> {pending} to review
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[#7a5a2c]">
                  Confirm the extracted fields to bring these bills into your totals.
                </p>
                <Link to="/verify" className="btn-primary mt-3 w-full min-h-[38px] text-xs">
                  Open review queue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : hasRecords ? (
              <div className="rounded-xl border border-leaf/15 bg-leaf-pale/60 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-forest">
                  <CheckCircle2 className="h-4 w-4 text-leaf" /> Nothing waiting
                </p>
                <p className="mt-1 text-[11px] leading-5 text-ink-soft">
                  All live documents have been reviewed. Add next month's bills when they arrive.
                </p>
                <Link to="/upload" className="btn-secondary mt-3 w-full min-h-[38px] text-xs">
                  <UploadCloud className="h-3.5 w-3.5" /> Add a document
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-sand/50 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-forest">
                  <UploadCloud className="h-4 w-4 text-leaf" /> Start with a bill
                </p>
                <p className="mt-1 text-[11px] leading-5 text-ink-soft">
                  Upload one document and confirm its fields. That is enough for a first total.
                </p>
                <Link to="/upload" className="btn-primary mt-3 w-full min-h-[38px] text-xs">
                  Add a document
                </Link>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeader title="Intensity" description="Footprint per unit and per rupee of revenue." />
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-sand/40 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Per unit produced
                </p>
                <p className="mt-1 text-lg font-semibold text-forest">
                  {data.intensity.kg_co2e_per_unit === null
                    ? "—"
                    : `${num(data.intensity.kg_co2e_per_unit, 4)} kg`}
                  <span className="ml-1 text-xs font-normal text-ink-muted">CO₂e</span>
                </p>
                <p className="mt-0.5 text-[10px] text-ink-muted">
                  {data.intensity.units_produced
                    ? `${num(data.intensity.units_produced, 0)} units produced`
                    : "Add units produced to see this metric."}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-sand/40 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  Per rupee of revenue
                </p>
                <p className="mt-1 text-lg font-semibold text-forest">
                  {data.intensity.kg_co2e_per_rupee === null
                    ? "—"
                    : `${num(data.intensity.kg_co2e_per_rupee, 6)} kg`}
                  <span className="ml-1 text-xs font-normal text-ink-muted">CO₂e</span>
                </p>
                <p className="mt-0.5 text-[10px] text-ink-muted">
                  {data.intensity.annual_revenue
                    ? `${inr(data.intensity.annual_revenue, true)} annual revenue`
                    : "Add annual revenue to see this metric."}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="This period" />
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-ink-muted">Confirmed records</dt>
                <dd className="font-semibold text-ink">{data.quality.verified_documents}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-ink-muted">Waiting review</dt>
                <dd className="font-semibold text-ink">{data.quality.pending_documents}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-ink-muted">Rejected</dt>
                <dd className="font-semibold text-ink">{data.quality.rejected_documents}</dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <dt className="text-ink-muted">Top source</dt>
                <dd className="text-right font-semibold text-ink">
                  {topEmitter ? `${topEmitter.label} · ${percent(topEmitter.share)}` : "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                loading={recalc.isPending}
                onClick={() => recalc.mutate()}
                disabled={!hasRecords}
              >
                Recalculate
              </Button>
              <Link to="/factors" className="btn-quiet min-h-[38px] px-3 text-xs">
                <FlaskConical className="h-3.5 w-3.5" /> Factors
              </Link>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-ink-muted">
              Recalculation reuses stored factors and snapshots the values into each result.
            </p>
          </Card>

          <div className="card-soft p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-forest">
              <AlertTriangle className="h-3.5 w-3.5 text-clay" /> What is counted here?
            </p>
            <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
              Only documents you have confirmed. Rejected documents stay in the audit trail but
              never enter totals. The reader cannot change a number that the deterministic engine
              has calculated.
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <Badge tone={data.demo ? "amber" : "leaf"}>{data.demo ? "Demo data" : "Live data"}</Badge>
          Factor mode: {data.factor_status.mode}
        </span>
        <span>
          {data.factor_status.factors.length} factor
          {data.factor_status.factors.length === 1 ? "" : "s"} in use
        </span>
      </div>
    </div>
  );
}
