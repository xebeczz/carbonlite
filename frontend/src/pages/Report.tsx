import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  FileSpreadsheet,
  FlaskConical,
  Leaf,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CategoryBars, MonthlyBarChart, ScopeDonut } from "../components/charts";
import {
  Alert,
  Badge,
  Button,
  Card,
  DemoBadge,
  ErrorPanel,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  ScoreRing,
  SectionHeader,
  StatusChip,
} from "../components/ui";
import { useApp } from "../context/AppContext";
import { ApiClientError, downloadReport, formatApiError, getReport } from "../lib/api";
import {
  formatDate,
  formatDateTime,
  formatPeriod,
  inr,
  num,
  percent,
  tonnes,
  unitLabel,
} from "../lib/format";

const FACTOR_STATUS_TONE: Record<string, "leaf" | "amber" | "danger" | "neutral"> = {
  verified: "leaf",
  demo: "amber",
  unverified: "danger",
};

export function ReportPage() {
  const { business, notify } = useApp();
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);
  const [downloadError, setDownloadError] = useState<unknown>(null);

  const query = useQuery({
    queryKey: ["report", business?.id],
    queryFn: () => getReport(business!.id),
    enabled: Boolean(business),
  });

  if (!business) return null;
  if (query.isLoading) return <PageSkeleton />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  const report = query.data;
  if (!report) return null;

  const scope1 = report.by_scope.find((row) => row.scope === 1);
  const scope2 = report.by_scope.find((row) => row.scope === 2);
  const topEmitter = report.totals.top_emitter;
  const blocked = !report.can_finalize;

  const handleDownload = async (format: "pdf" | "csv") => {
    setDownloading(format);
    setDownloadError(null);
    try {
      const filename = await downloadReport(report.business.id, format);
      notify(`Downloaded ${filename}`, "success");
    } catch (error) {
      setDownloadError(error);
      notify(formatApiError(error), "error");
    } finally {
      setDownloading(null);
    }
  };

  const downloadProblems =
    downloadError instanceof ApiClientError && downloadError.problems?.length
      ? downloadError.problems
      : report.problems;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Buyer-ready report"
        title="Supplier footprint report"
        description={
          <>
            {report.business.name} · {formatDate(report.period.start)} →{" "}
            {formatDate(report.period.end)} · Scope 1 and 2, prepared{" "}
            {formatDateTime(report.generated_at)}.
            {report.demo ? (
              <span className="ml-2 inline-flex align-middle">
                <DemoBadge />
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              icon={Download}
              loading={downloading === "pdf"}
              disabled={blocked || downloading !== null}
              onClick={() => void handleDownload("pdf")}
            >
              Download PDF
            </Button>
            <Button
              variant="secondary"
              icon={FileSpreadsheet}
              loading={downloading === "csv"}
              disabled={blocked || downloading !== null}
              onClick={() => void handleDownload("csv")}
            >
              CSV data
            </Button>
          </>
        }
      />

      {blocked ? (
        <Alert
          tone="danger"
          className="mb-4"
          title="This report cannot be finalized yet"
          action={
            <Link to="/verify" className="btn-secondary min-h-[36px] px-3 text-xs">
              Review records
            </Link>
          }
        >
          <ul className="mt-1 space-y-1">
            {(downloadProblems.length ? downloadProblems : report.problems).map((problem, index) => (
              <li key={index} className="flex gap-1.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-danger" />
                <span>{problem}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px]">
            The preview below is generated from the same data the PDF would use. The download stays
            locked until every blocking problem is fixed.
          </p>
        </Alert>
      ) : (
        <Alert tone="success" className="mb-4" title="Ready to finalize">
          Every counted record has a deterministic result and no used factor is marked VERIFY_ME.
          The PDF and CSV will include the full audit appendix.
        </Alert>
      )}

      {report.demo ? (
        <Alert tone="warning" className="mb-4" title="Demo report — illustrative factor values">
          <p>
            {report.watermark ||
              "This report uses illustrative demo data and cannot be presented as a verified disclosure."}{" "}
            The PDF carries this watermark on every page.
          </p>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <div className="relative overflow-hidden bg-forest px-5 py-6 text-white sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full border border-white/10" />
          <div className="relative grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f2c94c]">
                Greenhouse gas report · Scope 1 + 2
              </p>
              <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                {report.business.name}
              </h2>
              <p className="mt-2 text-xs text-[#cfe0d4]/75">
                {report.business.industry || "Industry not stated"} ·{" "}
                {report.business.location || "Location not stated"}
              </p>
              <p className="mt-1 text-xs text-[#cfe0d4]/75">
                Reporting period: {formatDate(report.period.start)} to {formatDate(report.period.end)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold">
                  {report.audit.counted} counted record{report.audit.counted === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold">
                  {report.completeness_pct}% complete
                </span>
                {report.demo ? (
                  <span className="rounded-full bg-[#f2c94c] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-forest-deep">
                    Demo · not for buyer
                  </span>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cfe0d4]/65">
                Total counted emissions
              </p>
              <p className="mt-1 font-display text-5xl leading-none">
                {tonnes(report.totals.kg_co2e)}
                <span className="ml-2 font-sans text-base font-medium text-[#cfe0d4]/75">t CO₂e</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/[0.06] p-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-[#cfe0d4]/55">Scope 2</p>
                  <p className="mt-0.5 text-sm font-semibold">{tonnes(scope2?.kg_co2e ?? 0, 2)} t</p>
                </div>
                <div className="rounded-lg bg-white/[0.06] p-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-[#cfe0d4]/55">Scope 1</p>
                  <p className="mt-0.5 text-sm font-semibold">{tonnes(scope1?.kg_co2e ?? 0, 2)} t</p>
                </div>
              </div>
              <p className="mt-3 text-[9px] leading-4 text-[#cfe0d4]/50">
                GHG Protocol · kg CO₂e = activity data × emission factor
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-line border-b border-line md:grid-cols-4">
          <div className="p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Data quality
            </p>
            <p className="mt-1 text-xl font-semibold text-forest">{report.quality.score} / 100</p>
          </div>
          <div className="p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Verified records
            </p>
            <p className="mt-1 text-xl font-semibold text-forest">
              {report.audit.counted}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Pending / rejected
            </p>
            <p className="mt-1 text-xl font-semibold text-forest">
              {report.audit.pending} / {report.audit.rejected}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Top source
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-forest">
              {topEmitter ? `${topEmitter.label} · ${percent(topEmitter.share)}` : "—"}
            </p>
          </div>
        </div>

        <div className="border-b border-line p-5 sm:p-6">
          <SectionHeader
            title="Executive summary"
            description="Scope 1 covers fuel burned on site. Scope 2 covers purchased grid electricity."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-line bg-sand/40 p-4 lg:col-span-2">
              <p className="text-sm leading-7 text-ink-soft">
                {report.business.name} counted{" "}
                <strong className="text-forest">{tonnes(report.totals.kg_co2e)} t CO₂e</strong> across{" "}
                {report.totals.record_count} confirmed record
                {report.totals.record_count === 1 ? "" : "s"} during{" "}
                {formatPeriod(report.period.start, report.period.end)}.{" "}
                {scope2 ? (
                  <>
                    Electricity accounted for {tonnes(scope2.kg_co2e, 2)} t ({percent(scope2.share)})
                    and fuel for {tonnes(scope1?.kg_co2e ?? 0, 2)} t ({percent(scope1?.share ?? 0)}).
                  </>
                ) : (
                  "No scope split is available yet."
                )}{" "}
                {report.quality.completeness_pct < 100
                  ? `${report.audit.pending} document${
                      report.audit.pending === 1 ? "" : "s"
                    } ${report.audit.pending === 1 ? "remains" : "remain"} outside the total until reviewed.`
                  : "All live documents have been reviewed."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-white px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-ink-muted">Completeness</p>
                  <p className="mt-0.5 text-sm font-semibold text-forest">
                    {percent(report.completeness_pct, 1)}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-white px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-ink-muted">Emissions</p>
                  <p className="mt-0.5 text-sm font-semibold text-forest">
                    {num(report.totals.kg_co2e, 0)} kg
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-white px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-ink-muted">Spend estimates</p>
                  <p className="mt-0.5 text-sm font-semibold text-forest">
                    {report.quality.spend_estimates}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                Verification posture
              </p>
              <ul className="mt-3 space-y-2.5 text-xs text-ink-soft">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                  Human-confirmed extracted fields
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                  Deterministic engine; no AI arithmetic
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                  Factor source and year on every row
                </li>
                <li className="flex items-start gap-2">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" />
                  Locked while any used factor is VERIFY_ME
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="grid gap-6 border-b border-line p-5 sm:p-6 lg:grid-cols-2">
          <MonthlyBarChart
            data={report.monthly}
            height={230}
            title="Monthly emissions"
            description="Tonnes CO₂e by the billing month of each counted record."
          />
          <div>
            <SectionHeader
              title="Emissions by source"
              description="Ordered categories that make up the counted total."
            />
            <CategoryBars rows={report.by_category} limit={6} />
          </div>
        </div>

        <div className="grid gap-6 border-b border-line p-5 sm:p-6 lg:grid-cols-3">
          <div>
            <ScopeDonut byScope={report.by_scope} totalKg={report.totals.kg_co2e} />
          </div>
          <div className="lg:col-span-2">
            <SectionHeader
              title="Data quality and completeness"
              description="Quality reflects confidence, human edits, and whether a spend fallback was used."
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ScoreRing value={report.quality.score} label="Quality" size={88} />
              <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-line bg-sand/40 p-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-ink-muted">High</p>
                  <p className="mt-0.5 text-lg font-semibold text-forest">{report.quality.mix.high}</p>
                </div>
                <div className="rounded-xl border border-line bg-sand/40 p-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-ink-muted">Medium</p>
                  <p className="mt-0.5 text-lg font-semibold text-clay">{report.quality.mix.medium}</p>
                </div>
                <div className="rounded-xl border border-line bg-sand/40 p-2.5">
                  <p className="text-[9px] uppercase tracking-wide text-ink-muted">Low</p>
                  <p className="mt-0.5 text-lg font-semibold text-danger">{report.quality.mix.low}</p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-ink-muted">Report completeness</span>
                <span className="font-semibold text-forest">
                  {percent(report.completeness_pct, 1)}
                </span>
              </div>
              <ProgressBar value={report.completeness_pct} className="mt-1.5" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-line p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-ink-muted">Verified</p>
                <p className="mt-0.5 text-base font-semibold text-forest">
                  {report.quality.verified_documents}
                </p>
              </div>
              <div className="rounded-xl border border-line p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-ink-muted">Pending</p>
                <p className="mt-0.5 text-base font-semibold text-clay">
                  {report.quality.pending_documents}
                </p>
              </div>
              <div className="rounded-xl border border-line p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-ink-muted">Rejected</p>
                <p className="mt-0.5 text-base font-semibold text-ink-soft">
                  {report.quality.rejected_documents}
                </p>
              </div>
            </div>
            {report.quality.spend_estimates > 0 ? (
              <Alert tone="warning" className="mt-4" title="Spend-based fallback used">
                {report.quality.spend_estimates} record
                {report.quality.spend_estimates === 1 ? " is" : "s are"} estimated from spend because
                activity quantity was missing. These are marked low quality.
              </Alert>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 border-b border-line p-5 sm:p-6 md:grid-cols-3">
          <div className="rounded-2xl border border-line bg-sand/40 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Intensity · units produced
            </p>
            <p className="mt-1 text-2xl font-semibold text-forest">
              {report.intensity.kg_co2e_per_unit === null
                ? "—"
                : `${num(report.intensity.kg_co2e_per_unit, 4)} kg`}
            </p>
            <p className="mt-1 text-[10px] text-ink-muted">
              {report.intensity.units_produced
                ? `per unit across ${num(report.intensity.units_produced, 0)} units`
                : "Units produced were not supplied."}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-sand/40 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Intensity · revenue
            </p>
            <p className="mt-1 text-2xl font-semibold text-forest">
              {report.intensity.kg_co2e_per_rupee === null
                ? "—"
                : `${num(report.intensity.kg_co2e_per_rupee, 6)} kg`}
            </p>
            <p className="mt-1 text-[10px] text-ink-muted">
              {report.intensity.annual_revenue
                ? `per ₹ of ${inr(report.intensity.annual_revenue, true)} revenue`
                : "Annual revenue was not supplied."}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-sand/40 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              Reporting standard
            </p>
            <p className="mt-1 text-sm font-semibold text-forest">GHG Protocol</p>
            <p className="mt-1 text-[10px] leading-4 text-ink-muted">
              Scope 1 + Scope 2 only. No Scope 3 categories are estimated.
            </p>
          </div>
        </div>

        <div className="border-b border-line p-5 sm:p-6">
          <SectionHeader
            title="Emission factor table"
            description="Every factor used in a counted result. Reports are blocked while any used factor is marked VERIFY_ME."
            action={
              <Link to="/factors" className="btn-quiet min-h-[34px] px-2 py-1 text-[11px]">
                <FlaskConical className="h-3.5 w-3.5" /> Full factor table
              </Link>
            }
          />
          {report.factors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-xs text-ink-muted">
              No factors have been used yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-sand/60 text-[9px] uppercase tracking-[0.08em] text-ink-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Activity</th>
                    <th className="px-3 py-2.5 font-semibold">Factor</th>
                    <th className="px-3 py-2.5 font-semibold">Source</th>
                    <th className="px-3 py-2.5 font-semibold">Year / region</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.factors.map((factor, index) => (
                    <tr key={`${factor.activity_key}-${factor.year}-${index}`}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-ink">{factor.category_label}</p>
                        <p className="font-mono text-[9px] text-ink-muted">{factor.activity_key}</p>
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        {factor.value === null ? "—" : num(factor.value, 4)}{" "}
                        <span className="text-[9px] text-ink-muted">
                          kg CO₂e/{factor.unit}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {factor.source}
                        {factor.source_version ? ` · ${factor.source_version}` : ""}
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">
                        {factor.year ?? "—"} · {factor.region || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={FACTOR_STATUS_TONE[factor.status] ?? "neutral"}>
                          {factor.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-forest">
                        {factor.record_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-b border-line p-5 sm:p-6">
          <SectionHeader
            title="Recommendations"
            description="Only present if actions have been generated for this reporting period."
            action={
              <Link to="/recommendations" className="btn-quiet min-h-[34px] px-2 py-1 text-[11px]">
                View actions
              </Link>
            }
          />
          {report.recommendations ? (
            <>
              <p className="text-sm leading-6 text-ink-soft">{report.recommendations.summary}</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {report.recommendations.items.slice(0, 4).map((item, index) => (
                  <li
                    key={`${item.title}-${index}`}
                    className="rounded-xl border border-line bg-sand/40 p-3"
                  >
                    <p className="text-xs font-semibold text-forest">{item.title}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">
                      {item.category} · {item.effort} effort
                      {item.est_tonnes_saved !== null && item.est_tonnes_saved !== undefined
                        ? ` · ~${num(item.est_tonnes_saved, 2)} t CO₂e`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10px] leading-4 text-ink-muted">
                {report.recommendations.disclaimer}
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line p-4">
              <p className="text-xs text-ink-muted">
                No actions have been generated yet. Recommendations are options, not part of the
                emissions total.
              </p>
              <Link to="/recommendations" className="btn-secondary min-h-[36px] px-3 text-xs">
                Generate actions
              </Link>
            </div>
          )}
        </div>

        <div className="border-b border-line p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Audit appendix</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Every document, including those excluded from totals, with the source and factor
                behind each counted result.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="chip-leaf">{report.audit.counted} counted</span>
              <span className="chip-amber">{report.audit.pending} pending</span>
              <span className="chip-danger">{report.audit.rejected} rejected</span>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead className="bg-sand/60 text-[9px] uppercase tracking-[0.08em] text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Document</th>
                  <th className="px-3 py-2.5 font-semibold">Vendor / period</th>
                  <th className="px-3 py-2.5 font-semibold">Quantity</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-right font-semibold">CO₂e</th>
                  <th className="px-3 py-2.5 font-semibold">Factor source</th>
                  <th className="px-3 py-2.5 font-semibold">Formula</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.audit.rows.map((row) => (
                  <tr key={row.document.id} className={clsx(!row.counted && "bg-sand/30")}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{row.document.original_filename}</p>
                      <p className="text-[9px] text-ink-muted">
                        #{row.document.id} · {row.document.doc_type.replaceAll("_", " ")}
                        {row.document.is_demo ? " · demo" : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-ink">{row.record.vendor || "—"}</p>
                      <p className="text-[9px] text-ink-muted">
                        {formatPeriod(row.record.billing_period_start, row.record.billing_period_end)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {row.record.quantity === null
                        ? "—"
                        : `${num(row.record.quantity, 2)} ${unitLabel(row.record.unit)}`}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip status={row.document.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-forest">
                      {row.result && row.counted ? `${tonnes(row.result.kg_co2e, 2)} t` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-ink-soft">
                      {row.result ? (
                        <>
                          <p>
                            {row.result.factor.source}
                            {row.result.factor.source_version
                              ? ` · ${row.result.factor.source_version}`
                              : ""}
                          </p>
                          <p className="text-[9px] text-ink-muted">
                            {row.result.factor.year ?? "—"} · {row.result.factor.region || "—"} ·{" "}
                            {row.result.factor.status}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5 font-mono text-[9px] leading-4 text-ink-muted">
                      {row.result?.formula_text ?? "Not calculated"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 border-b border-line p-5 sm:p-6 lg:grid-cols-2">
          <div>
            <SectionHeader title="Methodology" />
            <ol className="space-y-2.5">
              {report.methodology.map((line, index) => (
                <li key={index} className="flex gap-2 text-[11px] leading-5 text-ink-soft">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-leaf-pale text-[9px] font-bold text-leaf">
                    {index + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <SectionHeader title="Limitations" />
            <ul className="space-y-2.5">
              {report.limitations.map((line, index) => (
                <li key={index} className="flex gap-2 text-[11px] leading-5 text-ink-muted">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-leaf" />
            <div>
              <p className="text-xs font-semibold text-forest">
                Prepared by CarbonLite for {report.business.name}
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">
                Generated {formatDateTime(report.generated_at)} ·{" "}
                {report.demo ? "Demo data — not for buyer disclosure" : "No demo watermark"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={FileDown}
              size="sm"
              loading={downloading === "pdf"}
              disabled={blocked || downloading !== null}
              onClick={() => void handleDownload("pdf")}
            >
              Download PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={FileSpreadsheet}
              loading={downloading === "csv"}
              disabled={blocked || downloading !== null}
              onClick={() => void handleDownload("csv")}
            >
              Download CSV
            </Button>
            <Button
              variant="quiet"
              size="sm"
              icon={RefreshCw}
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["report", business.id] })}
            >
              Refresh preview
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <Leaf className="h-3 w-3 text-leaf" /> Scope 1 + Scope 2 · GHG Protocol · factors shown,
          never invented
        </span>
        <Link to="/buyer" className="inline-flex items-center gap-1 font-semibold text-leaf hover:underline">
          <Users className="h-3 w-3" /> Buyer view
        </Link>
      </div>
    </div>
  );
}
