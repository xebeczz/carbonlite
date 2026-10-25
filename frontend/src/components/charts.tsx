import { BarChart3, PieChart as PieIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { num, percent, tonnes } from "../lib/format";
import type { CategoryRow, MonthlyRow, ScopeRow } from "../lib/types";

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #dee3dc",
  fontSize: 12,
  boxShadow: "0 18px 40px -28px rgba(18,63,46,0.4)",
  padding: "8px 12px",
};

function ChartFrame({
  title,
  description,
  legend,
  children,
}: {
  title: string;
  description?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-forest">{title}</h3>
          {description ? <p className="mt-0.5 text-[11px] text-ink-muted">{description}</p> : null}
        </div>
        {legend}
      </div>
      {children}
    </div>
  );
}

export function MonthlyBarChart({
  data,
  height = 240,
  title = "Monthly emissions",
  description = "Counted tonnes CO₂e by billing month",
}: {
  data: MonthlyRow[];
  height?: number;
  title?: string;
  description?: string;
}) {
  const chartData = data.map((row) => ({
    label: row.label,
    tonnes: Number((row.kg_co2e / 1000).toFixed(3)),
    fullLabel: row.label,
  }));

  if (chartData.length === 0) {
    return (
      <ChartFrame title={title} description={description}>
        <div className="flex h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-line text-center">
          <BarChart3 className="h-6 w-6 text-ink-muted" />
          <p className="mt-2 text-xs font-medium text-ink-soft">No counted months yet</p>
          <p className="mt-1 max-w-xs text-[11px] leading-5 text-ink-muted">
            Emissions appear here after you confirm bills that include a billing period.
          </p>
        </div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={title}
      description={description}
      legend={
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-ink-muted">
          <span className="h-2 w-2 rounded-full bg-leaf" /> t CO₂e
        </span>
      }
    >
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="#ece9df" strokeDasharray="3 4" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#718077" }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#718077" }}
              tickFormatter={(value) => num(Number(value), 1)}
              width={48}
            />
            <Tooltip
              cursor={{ fill: "rgba(47,111,78,0.06)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${num(Number(value), 2)} t CO₂e`, "Emissions"]}
            />
            <Bar dataKey="tonnes" fill="#2f6f4e" radius={[6, 6, 0, 0]} maxBarSize={42} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

export function ScopeDonut({
  byScope,
  totalKg,
}: {
  byScope: ScopeRow[];
  totalKg: number;
}) {
  const scope1 = byScope.find((row) => row.scope === 1);
  const scope2 = byScope.find((row) => row.scope === 2);
  const rows = [
    { name: "Electricity", scope: "Scope 2", value: scope2?.kg_co2e ?? 0, color: "#2f6f4e" },
    { name: "Fuel", scope: "Scope 1", value: scope1?.kg_co2e ?? 0, color: "#b45309" },
  ];
  const data = rows.filter((row) => row.value > 0);
  const scope2Share = scope2?.share ?? 0;

  return (
    <ChartFrame
      title="Where it comes from"
      description="Electricity vs on-site fuel"
      legend={
        <span className="text-[10px] font-semibold text-ink-muted">
          {percent(scope2Share)} grid power
        </span>
      }
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-[170px] w-[170px] shrink-0">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={80}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`${num(Number(value) / 1000, 2)} t CO₂e`, "Emissions"]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center rounded-full border-[16px] border-sand-deep">
              <PieIcon className="h-6 w-6 text-ink-muted" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-semibold text-forest">
              {tonnes(totalKg, 2)}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              tonnes CO₂e
            </span>
          </div>
        </div>
        <div className="w-full space-y-2.5">
          {rows.map((row) => {
            const share = row.value > 0 && totalKg > 0 ? (row.value / totalKg) * 100 : 0;
            return (
              <div key={row.name} className="rounded-xl border border-line/80 bg-sand/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-ink">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.name}
                  </span>
                  <span className="font-semibold text-forest">{tonnes(row.value, 2)} t</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-ink-muted">
                  <span>{row.scope}</span>
                  <span>{percent(share)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ChartFrame>
  );
}

export function CategoryBars({
  rows,
  limit = 5,
}: {
  rows: CategoryRow[];
  limit?: number;
}) {
  const visible = rows.filter((row) => row.kg_co2e > 0).slice(0, limit);
  const max = Math.max(...visible.map((row) => row.kg_co2e), 1);

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-ink-muted">
        No counted categories yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {visible.map((row) => (
        <li key={row.category}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-ink">{row.label}</span>
            <span className="shrink-0 font-semibold text-forest">{tonnes(row.kg_co2e, 2)} t</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-deep">
              <div
                className="h-full rounded-full bg-leaf"
                style={{ width: `${Math.max(3, (row.kg_co2e / max) * 100)}%` }}
              />
            </div>
            <span className="w-9 text-right text-[10px] font-medium text-ink-muted">
              {percent(row.share)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
