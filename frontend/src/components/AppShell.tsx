import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  FileDown,
  FlaskConical,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Plus,
  ScrollText,
  UploadCloud,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { getDashboard } from "../lib/api";
import type { TranslationKey } from "../lib/i18n";
import { LanguageToggle, Logo } from "./ui";

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  badge?: number;
  end?: boolean;
}

function useNavItems(): { track: NavItem[]; improve: NavItem[]; share: NavItem[] } {
  const { business } = useApp();
  const pendingQuery = useQuery({
    queryKey: ["dashboard", business?.id],
    queryFn: () => getDashboard(business!.id),
    enabled: Boolean(business),
  });
  const pending = pendingQuery.data?.pending_documents ?? 0;

  return {
    track: [
      { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
      { to: "/upload", labelKey: "nav.upload", icon: UploadCloud },
      { to: "/verify", labelKey: "nav.verify", icon: ClipboardCheck, badge: pending },
      { to: "/records", labelKey: "nav.records", icon: ScrollText },
      { to: "/report", labelKey: "nav.report", icon: FileDown },
    ],
    improve: [
      { to: "/recommendations", labelKey: "nav.recommendations", icon: Lightbulb },
      { to: "/factors", labelKey: "nav.factors", icon: FlaskConical },
    ],
    share: [{ to: "/buyer", labelKey: "nav.buyer", icon: Users }],
  };
}

function BusinessSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { businesses, business, selectBusiness } = useApp();
  const navigate = useNavigate();

  if (businesses.length === 0) {
    return (
      <Link
        to="/onboarding"
        onClick={onNavigate}
        className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-sm font-semibold text-white hover:bg-white/10"
      >
        <Plus className="h-4 w-4" /> Set up a business
      </Link>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="business-switcher" className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#cfe0d4]/60">
          Business
        </label>
        {business?.is_demo ? (
          <span className="rounded-full bg-[#f2c94c]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#f2c94c]">
            Demo
          </span>
        ) : null}
      </div>
      <div className="relative mt-1">
        <select
          id="business-switcher"
          value={business?.id ?? ""}
          onChange={(event) => {
            if (event.target.value === "new") {
              onNavigate?.();
              navigate("/onboarding");
              return;
            }
            const next = Number(event.target.value);
            if (Number.isFinite(next) && next > 0) {
              selectBusiness(next);
              onNavigate?.();
            }
          }}
          className="w-full appearance-none truncate bg-transparent pr-6 text-sm font-semibold text-white outline-none"
        >
          {!business ? <option value="">Select a business</option> : null}
          {businesses.map((item) => (
            <option key={item.id} value={item.id} className="text-ink">
              {item.name}
            </option>
          ))}
          <option value="new" className="text-ink">
            + Add a business
          </option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-0.5 h-4 w-4 text-[#cfe0d4]/70" />
      </div>
      {business ? (
        <p className="mt-0.5 truncate text-[10px] text-[#cfe0d4]/55">{business.location || "Location not set"}</p>
      ) : null}
    </div>
  );
}

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const { t } = useApp();
  return (
    <div className="mt-6">
      {title ? (
        <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#cfe0d4]/45">
          {title}
        </p>
      ) : null}
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                clsx("nav-link", isActive && "nav-link-active")
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
              {item.badge ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f2c94c] px-1.5 text-[10px] font-bold text-forest-deep">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { business, meta } = useApp();
  const { track, improve, share } = useNavItems();
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-5 pt-5">
      <Link to="/" onClick={onNavigate} className="px-2">
        <Logo inverted />
      </Link>
      <BusinessSwitcher onNavigate={onNavigate} />
      <NavSection title="Track" items={track} onNavigate={onNavigate} />
      <NavSection title="Improve" items={improve} onNavigate={onNavigate} />
      <NavSection title="Share" items={share} onNavigate={onNavigate} />

      <div className="mt-auto pt-8">
        {business?.is_demo || meta?.factor_mode === "demo" ? (
          <div className="mb-4 rounded-xl border border-[#f2c94c]/20 bg-[#f2c94c]/[0.07] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f2c94c]">
              Demo mode
            </p>
            <p className="mt-1 text-[11px] leading-4 text-[#dce9df]/70">
              Factor values are illustrative. Reports carry a DEMO watermark.
            </p>
            <Link
              to="/factors"
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#f2c94c] hover:underline"
            >
              View factor sources
            </Link>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 px-1">
          <LanguageToggle inverted />
          <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#cfe0d4]/45">
            <BarChart3 className="h-3 w-3" /> v{meta?.version ?? "1.0"}
          </span>
        </div>
        <p className="mt-3 px-1 text-[10px] leading-4 text-[#cfe0d4]/40">
          AI reads documents. Code calculates every emission.
        </p>
      </div>
    </div>
  );
}

export function AppShell() {
  const { business, t } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const pendingQuery = useQuery({
    queryKey: ["dashboard", business?.id],
    queryFn: () => getDashboard(business!.id),
    enabled: Boolean(business),
  });
  const pending = pendingQuery.data?.pending_documents ?? 0;

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const mobileNav = [
    { to: "/dashboard", labelKey: "nav.dashboard" as TranslationKey, icon: LayoutDashboard, end: true },
    { to: "/upload", labelKey: "nav.upload" as TranslationKey, icon: UploadCloud },
    { to: "/verify", labelKey: "nav.verify" as TranslationKey, icon: ClipboardCheck, badge: pending },
    { to: "/records", labelKey: "nav.records" as TranslationKey, icon: ScrollText },
    { to: "/report", labelKey: "nav.report" as TranslationKey, icon: FileDown },
  ];

  return (
    <div className="min-h-screen bg-sand">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] bg-forest md:block">
        <SidebarBody />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-forest-deep/50 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[286px] max-w-[86vw] bg-forest shadow-lift animate-rise">
            <button
              type="button"
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-[#dce9df]/70 hover:bg-white/10 hover:text-white"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarBody onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="md:pl-[264px]">
        <header className="sticky top-0 z-40 border-b border-line/70 bg-sand/90 backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-xl text-forest hover:bg-white"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to={business ? "/dashboard" : "/"} aria-label="CarbonLite home">
              <Logo compact />
            </Link>
            <div className="flex items-center gap-1">
              <Link
                to="/buyer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-white hover:text-forest"
                aria-label={t("nav.buyer")}
              >
                <Users className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="mx-auto flex h-[68px] max-w-md items-stretch justify-around px-2">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx("mobile-nav-link", isActive && "mobile-nav-link-active")
                }
              >
                <span className="relative">
                  <Icon className="h-[21px] w-[21px]" />
                  {item.badge ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay px-1 text-[9px] font-bold text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span className="truncate">{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
