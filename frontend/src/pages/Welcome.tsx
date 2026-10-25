import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Calculator,
  Camera,
  CheckCircle2,
  FileCheck2,
  Leaf,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { getDashboard } from "../lib/api";
import { percent, tonnes } from "../lib/format";
import { Button, DemoBadge, LanguageToggle, Logo, Spinner } from "../components/ui";

export function WelcomePage() {
  const { business, meta, metaLoading, selectBusiness } = useApp();
  const navigate = useNavigate();
  const demoBusiness = meta?.demo.businesses[0] ?? null;
  const demoBuyer = meta?.demo.buyers[0] ?? null;
  const demoDashboard = useQuery({
    queryKey: ["dashboard", demoBusiness?.id],
    queryFn: () => getDashboard(demoBusiness!.id),
    enabled: Boolean(demoBusiness),
  });

  const portfolio = demoDashboard.data;

  const openDemo = () => {
    if (!demoBusiness) return;
    selectBusiness(demoBusiness.id);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen overflow-hidden bg-sand">
      <div className="pointer-events-none absolute -right-36 -top-36 h-[420px] w-[420px] rounded-full bg-leaf-pale/70 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 rounded-full bg-[#f1ead8]/70 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link to="/" aria-label="CarbonLite home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/buyer"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-white hover:text-forest sm:inline-flex"
          >
            <Users className="h-4 w-4" /> Buyer view
          </Link>
          <LanguageToggle />
          <Link to="/onboarding" className="btn-secondary hidden sm:inline-flex">
            Set up business
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <section className="grid items-center gap-12 pb-16 pt-8 lg:grid-cols-[1.06fr_0.94fr] lg:gap-16 lg:pb-24 lg:pt-14">
          <div className="animate-rise">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-leaf/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-forest shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-leaf" />
              </span>
              Climate reporting for small suppliers
            </div>
            <h1 className="display max-w-xl text-[2.7rem] leading-[1.03] sm:text-6xl">
              Know your footprint.
              <span className="mt-1 block text-leaf">Win the buyer.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-ink-soft">
              Photograph an electricity bill, fuel receipt, or LPG invoice. CarbonLite reads the
              fields, you confirm them, and a deterministic engine calculates Scope 1 and 2
              emissions — with the source, factor, and formula attached to every number.
            </p>

            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              {business ? (
                <>
                  <Link to="/dashboard" className="btn-primary">
                    Continue as {business.name}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {demoBusiness && business.id !== demoBusiness.id ? (
                    <button type="button" onClick={openDemo} className="btn-secondary">
                      Open the demo supplier
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <Button
                    onClick={openDemo}
                    disabled={!demoBusiness || metaLoading}
                    icon={Leaf}
                  >
                    {metaLoading ? "Preparing demo" : "Open the demo supplier"}
                  </Button>
                  <Link to="/onboarding" className="btn-secondary">
                    Set up my business
                  </Link>
                </>
              )}
            </div>

            {demoBusiness ? (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <DemoBadge />
                <span>
                  {demoBusiness.name} · 6 months of sample bills. Everything is labelled as demo
                  data.
                </span>
              </p>
            ) : null}

            <div className="mt-9 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
              {[
                { icon: Camera, label: "Snap or upload" },
                { icon: ShieldCheck, label: "You confirm the fields" },
                { icon: FileCheck2, label: "Auditable buyer report" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-leaf shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[440px] animate-rise lg:max-w-none">
            <div className="absolute -inset-5 -z-10 rotate-2 rounded-[2.2rem] border border-leaf/10 bg-white/45" />
            <div className="relative overflow-hidden rounded-[1.8rem] border border-line bg-white p-5 shadow-lift sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Demo preview</p>
                  <p className="mt-1 text-sm font-semibold text-forest">
                    {portfolio?.business.name ?? demoBusiness?.name ?? "Demo supplier"}
                  </p>
                </div>
                <DemoBadge label="Illustrative" />
              </div>

              {demoDashboard.isLoading ? (
                <div className="flex h-64 items-center justify-center text-ink-muted">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : portfolio ? (
                <>
                  <div className="mt-6 rounded-2xl bg-forest p-5 text-white">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#cfe0d4]/70">
                          Counted footprint
                        </p>
                        <p className="mt-1 font-display text-4xl font-semibold tracking-tight">
                          {tonnes(portfolio.totals.kg_co2e)}
                          <span className="ml-1.5 text-base font-sans font-medium text-[#cfe0d4]/80">
                            t CO2e
                          </span>
                        </p>
                      </div>
                      <span className="rounded-full border border-white/15 bg-white/10 p-2">
                        <Leaf className="h-4 w-4 text-[#f2c94c]" />
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#cfe0d4]/65">
                      {portfolio.totals.record_count} verified records ·{" "}
                      {portfolio.quality.completeness_pct}% complete
                    </p>
                    <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full bg-[#f2c94c]"
                        style={{ width: `${portfolio.by_scope.find((row) => row.scope === 2)?.share ?? 0}%` }}
                      />
                      <div className="h-full flex-1 bg-[#8fbfa4]" />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-[#cfe0d4]/75">
                      <span>Electricity</span>
                      <span>Fuel</span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {portfolio.by_category.slice(0, 3).map((row) => (
                      <div key={row.category}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-ink-soft">{row.label}</span>
                          <span className="font-semibold text-forest">
                            {tonnes(row.kg_co2e, 1)} t
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-sand-deep">
                          <div
                            className="h-full rounded-full bg-leaf"
                            style={{ width: `${Math.max(4, row.share)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <CheckCircle2 className="h-4 w-4 text-leaf" />
                      Every number links to a source
                    </div>
                    <span className="text-[10px] font-semibold text-leaf">
                      {percent(
                        portfolio.by_scope.find((row) => row.scope === 2)?.share ?? 0,
                      )}{" "}
                      grid power
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center">
                  <Leaf className="mx-auto h-8 w-8 text-leaf" />
                  <p className="mt-3 text-sm font-semibold text-forest">
                    Demo data will appear here
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Keep the API running and reload, or set up your own business.
                  </p>
                </div>
              )}
            </div>
            <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[11px] font-semibold text-forest shadow-card sm:flex">
              <Calculator className="h-4 w-4 text-leaf" />
              Code does the math
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Camera,
              title: "Bills in, data out",
              body: "AI reads Tamil or English bills, receipts, and invoices. It never estimates emissions.",
            },
            {
              icon: ShieldCheck,
              title: "Nothing counts until you say so",
              body: "Low-confidence fields are highlighted. Edit anything, then confirm. Your name is on the numbers.",
            },
            {
              icon: FileCheck2,
              title: "Report a buyer can check",
              body: "Source document, extracted values, factor year and source, and the exact formula — all in the appendix.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-leaf-pale text-leaf">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-sm font-semibold text-forest">{title}</h2>
              <p className="mt-1.5 text-[13px] leading-6 text-ink-muted">{body}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 overflow-hidden rounded-3xl bg-forest px-6 py-8 text-white sm:px-10 sm:py-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2c94c]">
                Built for the buyer conversation
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
                A supplier footprint a buyer can trust.
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#dce9df]/75">
                A buyer sees totals, Scope 1 and 2 splits, data completeness, and verification
                status across every supplier. No raw bill is exposed.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              {demoBuyer ? (
                <Link to="/buyer" className="btn bg-white text-forest hover:bg-[#f1f4ee]">
                  <Users className="h-4 w-4" /> View buyer demo
                </Link>
              ) : null}
              <Link
                to="/onboarding"
                className="btn border border-white/20 text-white hover:bg-white/10"
              >
                Set up my business
              </Link>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 py-10 text-[11px] text-ink-muted sm:flex-row">
          <span>© 2026 CarbonLite · Built for Tamil Nadu suppliers</span>
          <span className="flex items-center gap-1.5">
            <Leaf className="h-3.5 w-3.5 text-leaf" />
            Scope 1 + Scope 2 · GHG Protocol · No invented factors
          </span>
        </footer>
      </main>
    </div>
  );
}
