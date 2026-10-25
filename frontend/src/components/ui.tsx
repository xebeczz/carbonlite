import clsx from "clsx";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  Flame,
  Fuel,
  Info,
  Leaf,
  Loader2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useApp, type ToastTone } from "../context/AppContext";
import { formatApiError } from "../lib/api";
import { confidencePercent, DOC_TYPE_SHORT } from "../lib/format";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "sm" | "md";

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  quiet: "btn-quiet",
  danger: "btn-danger",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "min-h-[38px] px-3 py-1.5 text-xs",
  md: "",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return clsx(variantClass[variant], sizeClass[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon: Icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

export function Card({
  className,
  children,
  as: Component = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article";
}) {
  return <Component className={clsx("card", className)}>{children}</Component>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="display text-3xl leading-tight sm:text-[2.35rem]">{title}</h1>
        {description ? <div className="mt-2.5 text-sm leading-6 text-ink-soft">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-4 flex items-start justify-between gap-3", className)}>
      <div>
        <h2 className="section-title">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = "neutral" | "leaf" | "amber" | "danger" | "forest";

const badgeClass: Record<BadgeTone, string> = {
  neutral: "chip-neutral",
  leaf: "chip-leaf",
  amber: "chip-amber",
  danger: "chip-danger",
  forest: "chip border-forest/15 bg-forest/5 text-forest",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return <span className={clsx(badgeClass[tone], className)}>{children}</span>;
}

export function DemoBadge({ label = "Demo data" }: { label?: string }) {
  return <Badge tone="amber">{label}</Badge>;
}

export function StatusChip({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <span className="chip-leaf">
        <CheckCircle2 className="h-3.5 w-3.5" /> Counted
      </span>
    );
  }
  if (status === "extracted") {
    return (
      <span className="chip-amber">
        <AlertTriangle className="h-3.5 w-3.5" /> Needs review
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="chip-danger">
        <X className="h-3.5 w-3.5" /> Rejected
      </span>
    );
  }
  return <span className="chip-neutral">Needs data</span>;
}

export function ConfidenceChip({
  value,
  prefix = "Read",
}: {
  value: number | null | undefined;
  prefix?: string;
}) {
  if (value === null || value === undefined) {
    return <span className="chip-neutral">Not read</span>;
  }
  const low = value < 0.75;
  return (
    <span className={low ? "chip-amber" : "chip-leaf"}>
      {low ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {prefix} {confidencePercent(value)}
    </span>
  );
}

export function DocumentTypeIcon({
  docType,
  className,
}: {
  docType: string | null | undefined;
  className?: string;
}) {
  const map: Record<string, LucideIcon> = {
    electricity_bill: Zap,
    fuel_receipt: Fuel,
    lpg_invoice: Flame,
    unknown: FileQuestion,
  };
  const Icon = map[docType || "unknown"] || FileQuestion;
  return (
    <span
      className={clsx(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-leaf-pale text-leaf",
        className,
      )}
      title={DOC_TYPE_SHORT[docType || "unknown"]}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

type AlertTone = "info" | "warning" | "danger" | "success";

const alertStyles: Record<AlertTone, { wrap: string; icon: string; Icon: LucideIcon }> = {
  info: { wrap: "border-[#cfdcd4] bg-[#f3f7f4] text-ink-soft", icon: "text-leaf", Icon: Info },
  warning: { wrap: "border-clay/20 bg-[#fdf6ea] text-[#6f4a19]", icon: "text-clay", Icon: AlertTriangle },
  danger: { wrap: "border-danger/20 bg-[#fcf0ee] text-[#6e2b22]", icon: "text-danger", Icon: AlertCircle },
  success: { wrap: "border-leaf/20 bg-leaf-pale/70 text-[#204d37]", icon: "text-leaf", Icon: CheckCircle2 },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = alertStyles[tone];
  const Icon = style.Icon;
  return (
    <div className={clsx("flex gap-3 rounded-2xl border p-3.5 text-sm leading-6", style.wrap, className)}>
      <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", style.icon)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={clsx(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Leaf,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-leaf-pale text-leaf">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-forest">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-sm leading-6 text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("h-2 overflow-hidden rounded-full bg-sand-deep", className)}>
      <div
        className={clsx("h-full rounded-full bg-leaf transition-all duration-500", barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ScoreRing({
  value,
  label,
  size = 92,
}: {
  value: number;
  label?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 85 ? "#2f6f4e" : clamped >= 60 ? "#b45309" : "#a63d2e";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#ece9df" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-forest">{Math.round(clamped)}</span>
        {label ? <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</span> : null}
      </div>
    </div>
  );
}

export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={clsx("card p-5", className)}>
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-4 h-9 w-36" />
      <div className="skeleton mt-5 h-28 w-full" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-rise">
      <div className="skeleton h-3 w-28" />
      <div className="skeleton mt-3 h-10 w-72 max-w-full" />
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <LoadingBlock />
        <LoadingBlock />
        <LoadingBlock />
      </div>
      <div className="skeleton mt-4 h-64 w-full" />
    </div>
  );
}

export function ErrorPanel({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={clsx("card p-6", className)}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[#fbeceb] p-2 text-danger">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-forest">That did not load</h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{formatApiError(error)}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Check that the CarbonLite API is running, then try again.
          </p>
          {onRetry ? (
            <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismissToast } = useApp();
  const icons: Record<ToastTone, LucideIcon> = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
      {toasts.map((toast) => {
        const Icon = icons[toast.tone];
        return (
          <div
            key={toast.id}
            className={clsx(
              "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-lift animate-rise",
              toast.tone === "success" && "border-leaf/20 bg-white text-ink",
              toast.tone === "error" && "border-danger/25 bg-white text-ink",
              toast.tone === "info" && "border-line bg-white text-ink",
            )}
            role="status"
          >
            <Icon
              className={clsx(
                "mt-0.5 h-4 w-4 shrink-0",
                toast.tone === "success" && "text-leaf",
                toast.tone === "error" && "text-danger",
                toast.tone === "info" && "text-leaf",
              )}
            />
            <p className="min-w-0 flex-1 leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="-mr-1 rounded-md p-0.5 text-ink-muted hover:text-ink"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-forest-deep/45 p-4 backdrop-blur-[2px] sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-3xl border border-line bg-white p-5 shadow-lift animate-rise sm:p-6"
      >
        <h2 id="confirm-title" className="display text-xl">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-6 text-ink-soft">{description}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white text-forest shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
        <Leaf className="h-5 w-5" strokeWidth={2.2} />
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#f2c94c]" />
      </span>
      <span className="leading-none">
        <span
          className={clsx(
            "block font-display text-lg font-semibold tracking-[-0.02em]",
            inverted ? "text-white" : "text-forest",
          )}
        >
          CarbonLite
        </span>
        {!compact ? (
          <span
            className={clsx(
              "mt-1 block text-[9px] font-semibold uppercase tracking-[0.18em]",
              inverted ? "text-[#cfe0d4]/70" : "text-ink-muted",
            )}
          >
            Measure · Verify · Report
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function LanguageToggle({ inverted = false }: { inverted?: boolean }) {
  const { language, setLanguage } = useApp();
  return (
    <div
      className={clsx(
        "inline-flex items-center rounded-full border p-0.5 text-[11px] font-semibold",
        inverted ? "border-white/15 bg-white/5" : "border-line bg-white",
      )}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={clsx(
          "rounded-full px-2.5 py-1 transition",
          language === "en"
            ? inverted
              ? "bg-white text-forest"
              : "bg-forest text-white"
            : inverted
              ? "text-[#dce9df]/70"
              : "text-ink-muted",
        )}
        aria-pressed={language === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("ta")}
        className={clsx(
          "rounded-full px-2.5 py-1 transition",
          language === "ta"
            ? inverted
              ? "bg-white text-forest"
              : "bg-forest text-white"
            : inverted
              ? "text-[#dce9df]/70"
              : "text-ink-muted",
        )}
        aria-pressed={language === "ta"}
      >
        தமிழ்
      </button>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("h-4 w-4 animate-spin", className)} />;
}
