import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  EyeOff,
  Leaf,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CategoryBars, MonthlyBarChart, ScopeDonut } from "../components/charts";
import {
  Alert,
  Badge,
  Card,
  DemoBadge,
  EmptyState,
  ErrorPanel,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  ScoreRing,
  SectionHeader,
} from "../components/ui";
import { getBuyerOverview, getBuyerSupplierDetail, getBuyers } from "../lib/api";
import { formatDate, formatPeriod, num, percent, tonnes } from "../lib/format";
import type { BuyerDashboard, BuyerOverview, BuyerSummary } from "../lib/types";

function ScopeSplit({ row }: { row: BuyerSummary }) {
  const scope1 = row.by_scope.find((entry) => entry.scope === 1);
  const scope2 = row.by_scope.find((entry) => entry.scope === 2);
  const electricity = scope2?.share ?? 0;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-sand-deep">
        <div className="h-full bg-leaf" style={{ width: `${electricity}%` }} />
        <div className="h-full flex-1 bg-clay/70" />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-leaf" /> Electricity ·{" "}
          {tonnes(scope2?.kg_co2e ?? 0, 1)} t
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-clay/70" /> Fuel ·{" "}
          {tonnes(scope1?.kg_co2e ?? 0, 1)} t
        </span>
      </div>
    </div>
  );
}

function SupplierCard({ buyerId, supplier }: { buyerId: number; supplier: BuyerSummary }) {
  const business = supplier.business;
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-leaf-pale text-leaf">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-forest">{business.name}</h2>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              {business.industry || "Industry not stated"} · {business.location || "No location"}
            </p>
          </div>
        </div>
        {supplier.is_demo ? <DemoBadge /> : null}
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Counted footprint
          </p>
          <p className="mt-0.5 font-display text-3xl font-semibold text-forest">
            {num(supplier.total_tonnes, 2)}
            <span className="ml-1 text-xs font-sans font-medium text-ink-muted">t CO₂e</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Data quality
          </p>
          <p className="mt-0.5 text-lg font-semibold text-forest">{supplier.quality_score}</p>
        </div>
      </div>

      <div className="mt-3">
        <ScopeSplit row={supplier} />
      </div>

      <div className="mt-4 flex-1 space-y-3">
        <div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-ink-muted">Completeness</span>
            <span className="font-semibold text-forest">{percent(supplier.completeness_pct, 1)}</span>
          </div>
          <ProgressBar value={supplier.completeness_pct} className="mt-1" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip-leaf">{supplier.verified_documents} verified</span>
          {supplier.pending_documents > 0 ? (
            <span className="chip-amber">{supplier.pending_documents} pending</span>
          ) : (
            <span className="chip-neutral">No pending docs</span>
          )}
          {supplier.blocked ? <span className="chip-danger">Factor review</span> : null}
        </div>
        <div className="rounded-xl border border-line bg-sand/40 p-3 text-[10px] leading-4 text-ink-muted">
          <p>
            <span className="font-semibold text-ink-soft">Largest source:</span>{" "}
            {supplier.top_emitter
              ? `${supplier.top_emitter.label} (${percent(supplier.top_emitter.share)})`
              : "Not available"}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-ink-soft">Period:</span>{" "}
            {formatPeriod(supplier.period.start, supplier.period.end)}
          </p>
        </div>
      </div>

      <Link
        to={`/buyer/${buyerId}/suppliers/${business.id}`}
        className="btn-secondary mt-4 min-h-[40px] w-full text-xs"
      >
        View supplier footprint <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Card>
  );
}

function BuyerPortfolio({ overview }: { overview: BuyerOverview }) {
  const scope1 = overview.suppliers.reduce((sum, row) => sum + row.scope_1_kg, 0);
  const scope2 = overview.suppliers.reduce((sum, row) => sum + row.scope_2_kg, 0);
  const totalKg = scope1 + scope2;
  const electricityShare = totalKg > 0 ? (scope2 / totalKg) * 100 : 0;
  const pending = overview.totals.pending_documents;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="relative overflow-hidden bg-forest px-5 py-6 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border border-white/10" />
          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2c94c]">
                {overview.buyer.name} · supplier portfolio
              </p>
              <p className="mt-3 font-display text-5xl leading-none">
                {num(overview.totals.total_tonnes, 2)}
                <span className="ml-2 font-sans text-base font-medium text-[#cfe0d4]/70">
                  t CO₂e
                </span>
              </p>
              <p className="mt-2 text-xs text-[#cfe0d4]/70">
                Scope 1 + Scope 2 across {overview.totals.supplier_count} linked supplier
                {overview.totals.supplier_count === 1 ? "" : "s"} · confirmed records only
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold">
                  {overview.totals.verified_documents} verified documents
                </span>
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold">
                  Avg quality {overview.totals.average_quality}
                </span>
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold">
                  {overview.totals.average_completeness}% complete
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cfe0d4]/60">
                Grid electricity share
              </p>
              <p className="mt-1 font-display text-4xl leading-none">
                {percent(electricityShare, 0)}
              </p>
              <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-[#8fbfa4]" style={{ width: `${electricityShare}%` }} />
                <div className="h-full flex-1 bg-[#f2c94c]" />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[#cfe0d4]/70">
                <span>Scope 2 · {tonnes(scope2, 1)} t</span>
                <span>Scope 1 · {tonnes(scope1, 1)} t</span>
              </div>
              {pending > 0 ? (
                <p className="mt-4 flex items-start gap-1.5 text-[10px] leading-4 text-[#f2c94c]/90">
                  <Leaf className="mt-0.5 h-3 w-3 shrink-0" />
                  {pending} document{pending === 1 ? " is" : "s are"} awaiting supplier review and
                  not included.
                </p>
              ) : (
                <p className="mt-4 flex items-start gap-1.5 text-[10px] leading-4 text-[#cfe0d4]/60">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#8fbfa4]" />
                  All live supplier documents have been reviewed.
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Suppliers linked", value: String(overview.totals.supplier_count), hint: "Active supply relationships" },
          { label: "Scope 2 emissions", value: `${tonnes(scope2, 2)} t`, hint: "Purchased electricity" },
          { label: "Scope 1 emissions", value: `${tonnes(scope1, 2)} t`, hint: "Fuel burned on site" },
          { label: "Pending review", value: String(pending), hint: "Excluded until confirmed" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              {stat.label}
            </p>
            <p className="mt-1 text-xl font-semibold text-forest">{stat.value}</p>
            <p className="mt-1 text-[10px] text-ink-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Suppliers"
          description="Aggregates only. Supplier bills, images, and field-level edits are never exposed here."
          action={<Badge tone="leaf">Read-only portfolio</Badge>}
        />
        {overview.suppliers.length === 0 ? (
          <Card>
            <EmptyState
              icon={Users}
              title="No suppliers linked yet"
              description="Ask your suppliers to join CarbonLite, or load the demo seed to explore a populated buyer portfolio."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {overview.suppliers.map((supplier) => (
              <SupplierCard
                key={supplier.business.id}
                buyerId={overview.buyer.id}
                supplier={supplier}
              />
            ))}
          </div>
        )}
      </div>

      <Alert tone="info" className="mt-6" title="What the buyer can see">
        Totals, Scope 1 and 2 splits, data quality, completeness, verification status, and factor
        notices. Raw bills, uploaded files, and individual field values stay with the supplier.
      </Alert>
    </>
  );
}

export function BuyerPage() {
  const buyersQuery = useQuery({ queryKey: ["buyers"], queryFn: getBuyers });
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);
  const buyers = buyersQuery.data ?? [];
  const buyerId = selectedBuyerId ?? buyers[0]?.id ?? null;

  const overviewQuery = useQuery({
    queryKey: ["buyer", buyerId],
    queryFn: () => getBuyerOverview(buyerId!),
    enabled: buyerId !== null,
  });

  if (buyersQuery.isLoading) return <PageSkeleton />;
  if (buyersQuery.error) {
    return <ErrorPanel error={buyersQuery.error} onRetry={() => void buyersQuery.refetch()} />;
  }

  if (buyers.length === 0) {
    return (
      <div className="animate-rise">
        <PageHeader
          eyebrow="Buyer view"
          title="Supplier footprint overview"
          description="A read-only portfolio view for buyers. No raw bills are exposed."
        />
        <Card>
          <EmptyState
            icon={Users}
            title="No buyers configured"
            description="Load the demo seed (AUTO_SEED=true) or create a buyer link to see the procurement-side view."
            action={
              <Link to="/dashboard" className="btn-secondary">
                Back to dashboard
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const overview = overviewQuery.data;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Buyer view"
        title="Supplier footprint overview"
        description="A procurement-side portfolio: confirmed Scope 1 and 2 aggregates, quality, and completeness across linked suppliers."
        actions={
          <>
            {buyers.length > 1 ? (
              <div className="relative">
                <select
                  value={buyerId ?? ""}
                  onChange={(event) => setSelectedBuyerId(Number(event.target.value))}
                  className="select min-h-[40px] py-2 text-xs"
                  aria-label="Select buyer"
                >
                  {buyers.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <Badge tone="forest">{buyers[0].name}</Badge>
            )}
            <Badge tone="neutral">Read-only</Badge>
          </>
        }
      />

      {overviewQuery.isLoading ? (
        <PageSkeleton />
      ) : overviewQuery.error ? (
        <ErrorPanel error={overviewQuery.error} onRetry={() => void overviewQuery.refetch()} />
      ) : overview ? (
        <BuyerPortfolio overview={overview} />
      ) : null}
    </div>
  );
}

function DetailMetric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "leaf" | "amber" | "neutral";
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-4",
        tone === "leaf" && "border-leaf/15 bg-leaf-pale/50",
        tone === "amber" && "border-clay/20 bg-[#fdf6ea]",
        (!tone || tone === "neutral") && "border-line bg-white",
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-forest">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-ink-muted">{hint}</p>
    </div>
  );
}

function BuyerSupplierView({
  dashboard,
  buyerName,
}: {
  dashboard: BuyerDashboard;
  buyerName: string;
}) {
  const scope1 = dashboard.by_scope.find((row) => row.scope === 1);
  const scope2 = dashboard.by_scope.find((row) => row.scope === 2);
  const business = dashboard.business;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="relative overflow-hidden bg-forest px-5 py-6 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10" />
          <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2c94c]">
                {buyerName} · supplier disclosure
              </p>
              <h2 className="mt-2 font-display text-3xl leading-tight">{business.name}</h2>
              <p className="mt-1.5 text-xs text-[#cfe0d4]/70">
                {business.industry || "Industry not stated"} · {business.location || "No location"}
              </p>
              <p className="mt-1 text-xs text-[#cfe0d4]/70">
                Report period: {formatDate(business.reporting_period_start)} →{" "}
                {formatDate(business.reporting_period_end)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {dashboard.demo ? <DemoBadge /> : null}
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold">
                  {dashboard.quality.verified_documents} verified documents
                </span>
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold">
                  {dashboard.quality.completeness_pct}% complete
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cfe0d4]/60">
                Counted emissions
              </p>
              <p className="mt-1 font-display text-5xl leading-none">
                {tonnes(dashboard.totals.kg_co2e)}
                <span className="ml-2 font-sans text-base font-medium text-[#cfe0d4]/70">
                  t CO₂e
                </span>
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
                {dashboard.totals.record_count} confirmed records · GHG Protocol
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Alert tone="info" className="mt-4" title="Aggregated disclosure only">
        This view contains no source documents or field-level values. It reflects only records the
        supplier confirmed; pending documents are excluded from the total.
      </Alert>

      {dashboard.factor_status.blocked ? (
        <Alert tone="danger" className="mt-4" title="Factor verification in progress">
          {dashboard.factor_status.notice ||
            "The supplier's used emission factors include unverified values. Totals are provisional and reports are blocked."}
        </Alert>
      ) : dashboard.factor_status.notice ? (
        <Alert tone="warning" className="mt-4" title="Factor notice">
          {dashboard.factor_status.notice}
        </Alert>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailMetric
          label="Data quality"
          value={`${dashboard.quality.score} / 100`}
          hint="Confidence, human edits, and fallback usage"
        />
        <DetailMetric
          label="Completeness"
          value={percent(dashboard.quality.completeness_pct, 1)}
          hint={`${dashboard.quality.verified_documents} verified of ${dashboard.quality.total_documents} documents`}
        />
        <DetailMetric
          label="Pending review"
          value={String(dashboard.quality.pending_documents)}
          hint="Not yet included in the reported total"
          tone={dashboard.quality.pending_documents > 0 ? "amber" : "leaf"}
        />
        <DetailMetric
          label="Top source"
          value={
            dashboard.totals.top_emitter
              ? percent(dashboard.totals.top_emitter.share)
              : "—"
          }
          hint={dashboard.totals.top_emitter?.label ?? "No counted sources yet"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <MonthlyBarChart
            data={dashboard.monthly}
            height={240}
            title="Monthly emissions"
            description="Counted tonnes CO₂e by billing month"
          />
        </Card>
        <Card className="p-5">
          <SectionHeader
            title="Emissions by source"
            description="Ordered categories in the supplier's counted total."
          />
          <CategoryBars rows={dashboard.by_category} limit={6} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <ScopeDonut byScope={dashboard.by_scope} totalKg={dashboard.totals.kg_co2e} />
        </Card>
        <Card className="p-5">
          <SectionHeader
            title="Verification status"
            description="What the supplier confirmed, and what remains outside the total."
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ScoreRing value={dashboard.quality.score} label="Quality" size={92} />
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-line bg-sand/40 px-3 py-2.5 text-xs">
                <span className="text-ink-soft">Verified documents</span>
                <span className="font-semibold text-forest">
                  {dashboard.quality.verified_documents}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-line bg-sand/40 px-3 py-2.5 text-xs">
                <span className="text-ink-soft">Pending review</span>
                <span className="font-semibold text-clay">
                  {dashboard.quality.pending_documents}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-line bg-sand/40 px-3 py-2.5 text-xs">
                <span className="text-ink-soft">Rejected documents</span>
                <span className="font-semibold text-ink-soft">
                  {dashboard.quality.rejected_documents}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge tone="leaf">
              <ShieldCheck className="h-3 w-3" /> Human-confirmed records only
            </Badge>
            <Badge tone="neutral">Scope 1 + 2</Badge>
            <Badge tone="neutral">No Scope 3</Badge>
          </div>
        </Card>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-line bg-white p-4 text-[11px] leading-5 text-ink-muted">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
        <p>
          Supplier source files, extracted field values, and the review trail are private to the
          supplier. Buyers see this aggregate summary only.
        </p>
      </div>
    </>
  );
}

export function BuyerSupplierPage() {
  const params = useParams();
  const buyerId = Number(params.buyerId);
  const businessId = Number(params.businessId);
  const valid = Number.isFinite(buyerId) && buyerId > 0 && Number.isFinite(businessId) && businessId > 0;

  const query = useQuery({
    queryKey: ["buyer-supplier", buyerId, businessId],
    queryFn: () => getBuyerSupplierDetail(buyerId, businessId),
    enabled: valid,
  });

  if (!valid) {
    return (
      <div className="animate-rise">
        <ErrorPanel error={new Error("The supplier link is not valid.")} />
        <Link to="/buyer" className="btn-secondary mt-4">
          <ArrowLeft className="h-4 w-4" /> Back to buyer view
        </Link>
      </div>
    );
  }

  if (query.isLoading) return <PageSkeleton />;
  if (query.error) {
    return (
      <div className="animate-rise">
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
        <Link to="/buyer" className="btn-secondary mt-4">
          <ArrowLeft className="h-4 w-4" /> Back to buyer view
        </Link>
      </div>
    );
  }

  const detail = query.data;
  if (!detail) return null;

  return (
    <div className="animate-rise">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/buyer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-forest"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All suppliers
        </Link>
        <div className="flex items-center gap-2">
          <span className="chip-neutral">
            <Users className="h-3 w-3" /> Buyer view
          </span>
          <span
            className={clsx(
              detail.link_status === "active"
                ? "chip-leaf"
                : detail.link_status === "pending"
                  ? "chip-amber"
                  : "chip-danger",
            )}
          >
            {detail.link_status === "active"
              ? "Active supplier link"
              : detail.link_status === "pending"
                ? "Link pending"
                : "Link revoked"}
          </span>
        </div>
      </div>

      <BuyerSupplierView dashboard={detail.dashboard} buyerName={detail.buyer.name} />
    </div>
  );
}
