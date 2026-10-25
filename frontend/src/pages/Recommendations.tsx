import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Info,
  Leaf,
  Lightbulb,
  Sparkles,
  TrendingDown,
  UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  PageHeader,
  PageSkeleton,
  SectionHeader,
} from "../components/ui";
import { useApp } from "../context/AppContext";
import {
  ApiClientError,
  formatApiError,
  generateRecommendations,
  getRecommendations,
} from "../lib/api";
import { formatDateTime, inr, num, percent, tonnes } from "../lib/format";
import type { RecommendationItem, RecommendationsResponse } from "../lib/types";

const EFFORT_STYLE: Record<string, string> = {
  low: "chip-leaf",
  medium: "chip-amber",
  high: "chip-danger",
};

function RecommendationCard({
  item,
  categoryLabels,
}: {
  item: RecommendationItem;
  categoryLabels: Record<string, string>;
}) {
  const effort = item.effort ?? "medium";
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={EFFORT_STYLE[effort] ?? "chip-neutral"}>{effort} effort</span>
        <span className="chip-neutral">{categoryLabels[item.category] ?? item.category}</span>
        {item.estimate ? <span className="chip-amber">Estimate</span> : null}
      </div>
      <h3 className="mt-3 text-base font-semibold leading-6 text-forest">{item.title}</h3>
      {item.why ? <p className="mt-1.5 text-xs leading-5 text-ink-soft">{item.why}</p> : null}
      {item.action ? (
        <p className="mt-3 rounded-xl border border-line bg-sand/50 p-3 text-[11px] leading-5 text-ink-soft">
          {item.action}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-leaf-pale/60 p-3">
          <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-leaf">
            <TrendingDown className="h-3 w-3" /> Potential saving
          </p>
          <p className="mt-1 text-lg font-semibold text-forest">
            {item.est_tonnes_saved === null || item.est_tonnes_saved === undefined
              ? "—"
              : `${num(item.est_tonnes_saved, 2)} t`}
          </p>
          <p className="text-[9px] text-ink-muted">CO₂e per period</p>
        </div>
        <div className="rounded-xl bg-sand p-3">
          <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            <Banknote className="h-3 w-3" /> Indicative cost saving
          </p>
          <p className="mt-1 text-lg font-semibold text-forest">
            {item.est_rs_saved === null || item.est_rs_saved === undefined
              ? "—"
              : inr(item.est_rs_saved, true)}
          </p>
          <p className="text-[9px] text-ink-muted">annualised where bills exist</p>
        </div>
      </div>

      {item.assumptions.length > 0 ? (
        <details className="mt-4 rounded-xl border border-line px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-ink-soft">
            Assumptions behind these numbers
          </summary>
          <ul className="mt-2 space-y-1.5 pb-1">
            {item.assumptions.map((assumption, index) => (
              <li key={index} className="flex gap-1.5 text-[10px] leading-4 text-ink-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-leaf" />
                {assumption}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

export function RecommendationsPage() {
  const { business, notify } = useApp();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["recommendations", business?.id],
    queryFn: () => getRecommendations(business!.id),
    enabled: Boolean(business),
  });

  const mutation = useMutation({
    mutationFn: () => generateRecommendations(business!.id),
    onSuccess: (set) => {
      queryClient.setQueryData<RecommendationsResponse>(["recommendations", business?.id], {
        business_id: business!.id,
        has_recommendations: true,
        recommendations: set,
      });
      queryClient.invalidateQueries({ queryKey: ["report", business?.id] });
      notify("Actions generated from your confirmed data.", "success");
    },
    onError: (error) => notify(formatApiError(error), "error"),
  });

  if (!business) return null;
  if (query.isLoading) return <PageSkeleton />;
  if (query.error) return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;

  const set = query.data?.recommendations ?? null;
  const noVerifiedData =
    mutation.error instanceof ApiClientError && mutation.error.code === "no_verified_data";
  const categoryLabels: Record<string, string> = {};
  for (const category of set?.basis.categories ?? []) {
    categoryLabels[category.category] = category.label;
  }

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Step 3 · Act on the numbers"
        title="Actions for your footprint"
        description="Grounded in your counted categories. Savings are labelled estimates, never certified reductions."
        actions={
          <Button
            icon={Sparkles}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            disabled={query.data?.has_recommendations === false && false}
          >
            {set ? "Regenerate actions" : "Generate actions"}
          </Button>
        }
      />

      {!set ? (
        <div className="card">
          <EmptyState
            icon={Lightbulb}
            title="Turn your footprint into a plan"
            description={
              noVerifiedData
                ? "CarbonLite needs at least one confirmed record before it can suggest grounded actions. Upload a bill and confirm the fields first."
                : "Generate practical actions ranked by your largest categories. Every estimate names the assumption behind it."
            }
            action={
              noVerifiedData ? (
                <>
                  <Link to="/upload" className="btn-primary">
                    <UploadCloud className="h-4 w-4" /> Add a document
                  </Link>
                  <Link to="/verify" className="btn-secondary">
                    Review queue
                  </Link>
                </>
              ) : (
                <Button
                  icon={Sparkles}
                  loading={mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  Generate actions
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <Card className="mb-5 overflow-hidden">
            <div className="grid md:grid-cols-[1.2fr_0.8fr]">
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip-leaf">
                    <CheckCircle2 className="h-3 w-3" /> Grounded in your data
                  </span>
                  <span className="chip-neutral">{set.method_label}</span>
                </div>
                <p className="mt-4 text-sm leading-7 text-ink-soft">{set.summary}</p>
                {set.notice ? (
                  <Alert tone="info" className="mt-4">
                    {set.notice}
                  </Alert>
                ) : null}
                <p className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-muted">
                  <CalendarClock className="h-3 w-3" /> Generated {formatDateTime(set.generated_at)}
                </p>
              </div>
              <div className="border-t border-line bg-sand/50 p-5 md:border-l md:border-t-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Based on
                </p>
                <dl className="mt-2 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-ink-muted">Counted footprint</dt>
                    <dd className="font-semibold text-forest">
                      {tonnes(set.basis.total_tonnes_co2e * 1000, 2)} t
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-ink-muted">Data quality</dt>
                    <dd className="font-semibold text-ink">{set.basis.quality_score} / 100</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-ink-muted">Completeness</dt>
                    <dd className="font-semibold text-ink">
                      {percent(set.basis.completeness_pct, 1)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                    <dt className="text-ink-muted">Largest category</dt>
                    <dd className="text-right font-semibold text-ink">
                      {set.basis.categories[0]
                        ? `${set.basis.categories[0].label} · ${percent(set.basis.categories[0].share)}`
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <Link to="/dashboard" className="btn-secondary mt-4 w-full min-h-[38px] text-xs">
                  Open dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </Card>

          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionHeader
              title="Recommended actions"
              description="Ordered by the size of your categories. Estimates assume the percentages listed on each card."
              className="mb-0"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {set.items.map((item, index) => (
              <RecommendationCard
                key={`${item.title}-${index}`}
                item={item}
                categoryLabels={categoryLabels}
              />
            ))}
          </div>

          <Alert tone="warning" className="mt-5" title="These are estimates, not guarantees">
            <p>{set.disclaimer}</p>
          </Alert>

          {set.basis.categories.length > 0 ? (
            <Card className="mt-5 p-5">
              <SectionHeader
                title="What the recommendations are built on"
                description="Only counted categories appear here. Nothing is inferred from missing data."
              />
              <div className="space-y-2.5">
                {set.basis.categories.map((category) => (
                  <div
                    key={category.category}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-sand/40 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-xs font-semibold text-ink">{category.label}</p>
                      <p className="text-[10px] text-ink-muted">
                        {category.spend_inr
                          ? `${inr(category.spend_inr)} in verified bills`
                          : "No verified spend on file"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold text-forest">
                        {tonnes(category.kg_co2e, 2)} t
                      </span>
                      <span className="chip-neutral">{percent(category.share)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <Info className="h-3 w-3" /> The AI, when configured, can phrase actions but cannot
              change your totals.
            </span>
            <Link to="/factors" className="font-semibold text-leaf hover:underline">
              See the factors behind the numbers →
            </Link>
          </div>
        </>
      )}

      {noVerifiedData ? (
        <Alert tone="warning" className="mt-5" title="No confirmed data yet">
          Confirm at least one document before generating actions.{" "}
          <Link to="/verify" className="font-semibold underline underline-offset-2">
            Go to the review queue
          </Link>
          .
        </Alert>
      ) : mutation.error && !noVerifiedData ? (
        <Alert tone="danger" className="mt-5" title="Could not generate actions">
          {formatApiError(mutation.error)}
        </Alert>
      ) : null}

      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[10px] text-ink-muted">
        <Leaf className="h-3 w-3 text-leaf" />
        Grounded estimates · assumptions shown · no invented data
      </p>
    </div>
  );
}
