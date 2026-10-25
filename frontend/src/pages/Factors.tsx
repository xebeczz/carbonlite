import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  CheckCircle2,
  FlaskConical,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorPanel,
  PageHeader,
  PageSkeleton,
  SectionHeader,
} from "../components/ui";
import { useApp } from "../context/AppContext";
import { formatApiError, getFactors, reloadFactors } from "../lib/api";
import { num } from "../lib/format";
import type { FactorRow } from "../lib/types";

const STATUS_TONE: Record<string, "leaf" | "amber" | "danger" | "neutral"> = {
  verified: "leaf",
  demo: "amber",
  unverified: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  verified: "Verified",
  demo: "Demo",
  unverified: "VERIFY_ME",
};

function FactorTable({ factors }: { factors: FactorRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-sand/60 text-[9px] uppercase tracking-[0.08em] text-ink-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Activity</th>
              <th className="px-3 py-2.5 font-semibold">Factor</th>
              <th className="px-3 py-2.5 font-semibold">Source</th>
              <th className="px-3 py-2.5 font-semibold">Version</th>
              <th className="px-3 py-2.5 font-semibold">Year</th>
              <th className="px-3 py-2.5 font-semibold">Region</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {factors.map((factor) => (
              <tr key={factor.id} className="align-top">
                <td className="px-3 py-3">
                  <p className="font-mono text-[10px] font-medium text-ink">{factor.activity_key}</p>
                  {factor.notes ? (
                    <p className="mt-1 max-w-[220px] text-[9px] leading-4 text-ink-muted">
                      {factor.notes}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  {factor.factor_kg_co2e_per_unit === null ? (
                    <span className="font-semibold text-danger">No value</span>
                  ) : (
                    <span className="font-semibold text-forest">
                      {num(factor.factor_kg_co2e_per_unit, 4)}
                    </span>
                  )}
                  <p className="text-[9px] text-ink-muted">kg CO₂e / {factor.unit}</p>
                </td>
                <td className="max-w-[180px] px-3 py-3 text-[10px] leading-4 text-ink-soft">
                  {factor.source || "—"}
                </td>
                <td className="px-3 py-3 text-[10px] text-ink-soft">
                  {factor.source_version || "—"}
                </td>
                <td className="px-3 py-3 text-ink-soft">{factor.year || "—"}</td>
                <td className="px-3 py-3">
                  <span className="rounded-md border border-line bg-sand px-1.5 py-0.5 font-mono text-[9px] text-ink-soft">
                    {factor.region || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <Badge tone={STATUS_TONE[factor.status] ?? "neutral"}>
                    {STATUS_LABEL[factor.status] ?? factor.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2.5 md:hidden">
        {factors.map((factor) => (
          <div key={factor.id} className="rounded-xl border border-line bg-white p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-all font-mono text-[10px] font-semibold text-ink">
                  {factor.activity_key}
                </p>
                <p className="mt-0.5 text-[10px] text-ink-muted">
                  {factor.year || "—"} · {factor.region || "—"}
                </p>
              </div>
              <Badge tone={STATUS_TONE[factor.status] ?? "neutral"}>
                {STATUS_LABEL[factor.status] ?? factor.status}
              </Badge>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p className="text-sm font-semibold text-forest">
                {factor.factor_kg_co2e_per_unit === null
                  ? "No value"
                  : num(factor.factor_kg_co2e_per_unit, 4)}
                <span className="ml-1 text-[9px] font-normal text-ink-muted">
                  kg CO₂e / {factor.unit}
                </span>
              </p>
            </div>
            <p className="mt-2 border-t border-line pt-2 text-[9px] leading-4 text-ink-muted">
              {factor.source || "No source"}
              {factor.source_version ? ` · ${factor.source_version}` : ""}
            </p>
            {factor.notes ? (
              <p className="mt-1 text-[9px] leading-4 text-ink-muted">{factor.notes}</p>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

export function FactorsPage() {
  const { notify, meta } = useApp();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["factors"], queryFn: getFactors });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "verified" | "demo" | "unverified">("all");

  const reload = useMutation({
    mutationFn: reloadFactors,
    onSuccess: (payload) => {
      queryClient.setQueryData(["factors"], payload);
      notify(`Reloaded ${payload.counts.total} factors from ${payload.factor_file ?? "the factor file"}.`, "success");
    },
    onError: (error) => notify(formatApiError(error), "error"),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = query.data?.factors ?? [];
    return rows.filter((factor) => {
      if (status !== "all" && factor.status !== status) return false;
      if (!needle) return true;
      return [
        factor.activity_key,
        factor.source,
        factor.source_version,
        factor.region,
        factor.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query.data, search, status]);

  if (query.isLoading) return <PageSkeleton />;
  if (query.error) {
    return <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />;
  }

  const table = query.data;
  if (!table) return null;

  const isDemoMode = table.mode === "demo" || meta?.factor_mode === "demo";
  const hasUnverified = table.counts.unverified > 0;

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Method and transparency"
        title="Emission factors"
        description="The deterministic engine multiplies confirmed activity data by these factors. The AI never chooses, invents, or recalculates a factor value."
        actions={
          <>
            <Badge tone={isDemoMode ? "amber" : "leaf"}>
              {isDemoMode ? "Demo factor set" : "Strict factor set"}
            </Badge>
            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={reload.isPending}
              onClick={() => reload.mutate()}
            >
              Reload from CSV
            </Button>
          </>
        }
      />

      <Alert
        tone={hasUnverified ? "danger" : isDemoMode ? "warning" : "success"}
        title={hasUnverified ? "Verification required before finalizing reports" : table.notice}
        action={
          <span className="hidden sm:inline-flex">
            {hasUnverified ? (
              <ShieldAlert className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>
        }
      >
        {hasUnverified ? <p>{table.notice}</p> : null}
        <p className="mt-1 text-[11px]">
          Loaded from <span className="font-mono">{table.factor_file ?? "factors CSV"}</span> in{" "}
          <span className="font-semibold">{table.mode}</span> mode. Every calculated result stores a
          snapshot of the factor value, source, version, year, and region it used.
        </p>
      </Alert>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Total factors",
            value: table.counts.total,
            hint: "Rows in the loaded file",
            tone: "neutral" as const,
            icon: FlaskConical,
          },
          {
            label: "Verified",
            value: table.counts.verified,
            hint: "Required for a non-demo report",
            tone: "leaf" as const,
            icon: CheckCircle2,
          },
          {
            label: "Demo values",
            value: table.counts.demo,
            hint: "Illustrative, labelled DEMO",
            tone: "amber" as const,
            icon: Info,
          },
          {
            label: "VERIFY_ME",
            value: table.counts.unverified,
            hint: "Block counting and reports",
            tone: "danger" as const,
            icon: ShieldAlert,
          },
        ].map(({ label, value, hint, tone, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-forest">{value}</p>
                <p className="mt-1 text-[10px] leading-4 text-ink-muted">{hint}</p>
              </div>
              <span
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  tone === "leaf" && "bg-leaf-pale text-leaf",
                  tone === "amber" && "bg-[#fdf3e4] text-clay",
                  tone === "danger" && "bg-[#fbeceb] text-danger",
                  tone === "neutral" && "bg-sand text-ink-soft",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <SectionHeader
          title="How a factor is chosen"
          description="Reproducible rules, not a language-model guess."
        />
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "Resolve the activity",
              body: "Electricity uses grid electricity. Diesel, petrol, and LPG resolve to their own activity keys via the confirmed fuel type.",
            },
            {
              step: "2",
              title: "Latest year wins",
              body: "The engine selects the newest factor for the business region, falling back to an ALL-region factor if needed.",
            },
            {
              step: "3",
              title: "Snapshot the provenance",
              body: "Value, unit, source, version, year, region, and status are copied onto the result so the report can always show them.",
            },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-line bg-sand/40 p-3.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-white">
                {item.step}
              </span>
              <p className="mt-2 text-xs font-semibold text-forest">{item.title}</p>
              <p className="mt-1 text-[10px] leading-5 text-ink-muted">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-clay/20 bg-[#fdf6ea] p-3 text-[10px] leading-5 text-[#6f4a19]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            A factor marked <span className="font-mono font-semibold">VERIFY_ME</span> is treated as
            missing, never as zero. A record that needs it cannot be counted, and the PDF and CSV
            downloads stay locked until a real value is loaded.
          </p>
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="section-title">Factor table</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Showing {filtered.length} of {table.counts.total} factors.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted/70" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input min-h-[38px] py-2 pl-8 text-xs"
                placeholder="Search activity, source, notes"
                aria-label="Search factors"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(["all", "verified", "demo", "unverified"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-[10px] font-semibold transition",
                    status === option
                      ? "border-forest bg-forest text-white"
                      : "border-line bg-white text-ink-muted hover:border-leaf hover:text-forest",
                  )}
                >
                  {option === "all"
                    ? "All"
                    : option === "unverified"
                      ? "VERIFY_ME"
                      : option === "demo"
                        ? "Demo"
                        : "Verified"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {filtered.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No factors match"
              description="Adjust the search or status filter."
            />
          ) : (
            <FactorTable factors={filtered} />
          )}
        </div>
      </Card>

      <p className="mt-4 text-[10px] leading-5 text-ink-muted">
        Factor values are supplied through the factor CSV. CarbonLite does not recall emission
        factors from memory or estimate them with a language model. In demo mode the values are
        illustrative and every report carries a DEMO watermark.
      </p>
    </div>
  );
}
