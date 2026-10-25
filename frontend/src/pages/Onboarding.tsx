import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, CalendarRange, CheckCircle2, Factory, Leaf, MapPin } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, LanguageToggle, Logo } from "../components/ui";
import { useApp } from "../context/AppContext";
import { createBusiness, formatApiError } from "../lib/api";

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultPeriod(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  return { start: isoDate(start), end: isoDate(today) };
}

export function OnboardingPage() {
  const { language, selectBusiness, refreshBusinesses, notify, meta } = useApp();
  const navigate = useNavigate();
  const period = defaultPeriod();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(period.start);
  const [end, setEnd] = useState(period.end);
  const [units, setUnits] = useState("");
  const [revenue, setRevenue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);

  const mutation = useMutation({
    mutationFn: createBusiness,
    onSuccess: async (business) => {
      await refreshBusinesses();
      selectBusiness(business.id);
      notify(`${business.name} is ready. Add your first bill.`, "success");
      navigate("/upload");
    },
    onError: (mutationError) => setError(formatApiError(mutationError)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Enter your business name (at least 2 characters).");
      return;
    }
    if (!start || !end) {
      setError("Choose the reporting period you want to measure.");
      return;
    }
    if (end < start) {
      setError("The reporting period end must be on or after the start date.");
      return;
    }
    mutation.mutate({
      name: name.trim(),
      industry: industry.trim(),
      location: location.trim(),
      language,
      reporting_period_start: start,
      reporting_period_end: end,
      units_produced: units.trim() ? Number(units) : null,
      annual_revenue: revenue.trim() ? Number(revenue) : null,
    });
  };

  return (
    <div className="min-h-screen bg-sand">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-forest">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <Logo />
        <LanguageToggle />
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 pb-20 pt-4 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:pt-10">
        <section className="animate-rise lg:pt-4">
          <p className="eyebrow">Step 1 of 3</p>
          <h1 className="display mt-2 text-4xl leading-[1.06] sm:text-[2.8rem]">
            Set up your business
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-ink-soft">
            Two minutes now saves a week of spreadsheet pain later. We only need the basics — you
            can add bills right after this.
          </p>

          <div className="mt-8 space-y-5">
            {[
              {
                icon: Building2,
                title: "Name and location",
                body: "Tells the buyer who the report belongs to.",
              },
              {
                icon: CalendarRange,
                title: "Reporting period",
                body: "Bills outside this window are flagged, never silently dropped.",
              },
              {
                icon: Factory,
                title: "Production and revenue",
                body: "Optional, used only for intensity metrics such as kg CO2e per unit.",
              },
            ].map(({ icon: Icon, title, body }, index) => (
              <div key={title} className="flex gap-3.5">
                <div className="relative">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-leaf">
                    <Icon className="h-5 w-5" />
                  </span>
                  {index < 2 ? (
                    <span className="absolute left-1/2 top-11 h-6 w-px -translate-x-1/2 bg-line" />
                  ) : null}
                </div>
                <div>
                  <p className="text-sm font-semibold text-forest">{title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>

          {meta ? (
            <div className="mt-8 rounded-2xl border border-line bg-white/60 p-4 text-xs leading-5 text-ink-muted">
              <p className="font-semibold text-forest">
                {meta.factor_mode === "demo"
                  ? "This demo uses illustrative factor values"
                  : "Your factor table is in strict mode"}
              </p>
              <p className="mt-1">
                {meta.factor_mode === "demo"
                  ? "Reports will be watermarked DEMO until verified emission factors replace the illustrative ones."
                  : "Reports are blocked if any used factor is still marked VERIFY_ME."}
              </p>
            </div>
          ) : null}
        </section>

        <section className="card animate-rise p-5 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-forest">Business details</h2>
              <p className="mt-1 text-xs text-ink-muted">
                You can switch between businesses at any time.
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-leaf-pale text-leaf">
              <Leaf className="h-4 w-4" />
            </span>
          </div>

          {error ? (
            <Alert tone="danger" title="Could not create the business" className="mb-5">
              {error}
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="name">
                Business name <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted/70" />
                <input
                  id="name"
                  className="input pl-9"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Sri Meenakshi Fabrics"
                  maxLength={200}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="industry">
                  Industry
                </label>
                <input
                  id="industry"
                  className="input"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="Textile manufacturing"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="label" htmlFor="location">
                  Location
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted/70" />
                  <input
                    id="location"
                    className="input pl-9"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Tiruppur, Tamil Nadu"
                    maxLength={200}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="period-start">
                  Reporting period starts <span className="text-danger">*</span>
                </label>
                <input
                  id="period-start"
                  type="date"
                  className="input"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="period-end">
                  Reporting period ends <span className="text-danger">*</span>
                </label>
                <input
                  id="period-end"
                  type="date"
                  className="input"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowOptional((value) => !value)}
                className="flex items-center gap-1.5 text-xs font-semibold text-leaf hover:underline"
              >
                {showOptional ? "Hide optional metrics" : "Add optional intensity metrics"}
              </button>
              {showOptional ? (
                <div className="mt-3 grid gap-4 rounded-2xl border border-line bg-sand/60 p-3.5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="units">
                      Units produced
                    </label>
                    <input
                      id="units"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="input"
                      value={units}
                      onChange={(event) => setUnits(event.target.value)}
                      placeholder="e.g. 420000"
                    />
                    <p className="mt-1 text-[10px] text-ink-muted">Metres, pieces, tonnes — your choice.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="revenue">
                      Annual revenue (₹)
                    </label>
                    <input
                      id="revenue"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      className="input"
                      value={revenue}
                      onChange={(event) => setRevenue(event.target.value)}
                      placeholder="e.g. 48000000"
                    />
                    <p className="mt-1 text-[10px] text-ink-muted">Used for kg CO2e per rupee of revenue.</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-leaf-pale/60 p-3 text-[11px] leading-5 text-forest">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" />
              <p>
                No emissions are estimated at this step. Your numbers start when you upload a
                document and confirm the extracted fields.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Link to="/" className="btn-quiet">
                Cancel
              </Link>
              <Button type="submit" loading={mutation.isPending} icon={ArrowRight}>
                Create business & upload a bill
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
