import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { getBusinesses, getMeta } from "../lib/api";
import { translate, type Lang, type TranslationKey } from "../lib/i18n";
import type { Business, Meta } from "../lib/types";

const BUSINESS_KEY = "carbonlite.businessId";
const LANG_KEY = "carbonlite.lang";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppContextValue {
  businesses: Business[];
  business: Business | null;
  selectedId: number | null;
  selectBusiness: (id: number | null) => void;
  refreshBusinesses: () => Promise<unknown>;
  meta: Meta | undefined;
  metaLoading: boolean;
  loading: boolean;
  error: unknown;
  language: Lang;
  setLanguage: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
  notify: (message: string, tone?: ToastTone) => void;
  toasts: ToastItem[];
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function readStoredId(): number | null {
  try {
    const raw = window.localStorage.getItem(BUSINESS_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(LANG_KEY) === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const businessesQuery = useQuery({
    queryKey: ["businesses"],
    queryFn: getBusinesses,
  });
  const metaQuery = useQuery({ queryKey: ["meta"], queryFn: getMeta });
  const [selectedId, setSelectedId] = useState<number | null>(() => readStoredId());
  const [language, setLanguageState] = useState<Lang>(() => readStoredLang());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = useRef(0);

  const businesses = useMemo(
    () => businessesQuery.data ?? [],
    [businessesQuery.data],
  );

  const business = useMemo(
    () => businesses.find((item) => item.id === selectedId) ?? null,
    [businesses, selectedId],
  );

  useEffect(() => {
    if (!businessesQuery.data) return;
    if (selectedId !== null && !businessesQuery.data.some((item) => item.id === selectedId)) {
      setSelectedId(null);
      try {
        window.localStorage.removeItem(BUSINESS_KEY);
      } catch {
        // storage can be blocked in private mode
      }
    }
  }, [businessesQuery.data, selectedId]);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(LANG_KEY, language);
    } catch {
      // ignore storage failures
    }
  }, [language]);

  const selectBusiness = useCallback((id: number | null) => {
    setSelectedId(id);
    try {
      if (id === null) window.localStorage.removeItem(BUSINESS_KEY);
      else window.localStorage.setItem(BUSINESS_KEY, String(id));
    } catch {
      // ignore storage failures
    }
  }, []);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translate(key, language),
    [language],
  );

  const value: AppContextValue = {
    businesses,
    business,
    selectedId,
    selectBusiness,
    refreshBusinesses: businessesQuery.refetch,
    meta: metaQuery.data,
    metaLoading: metaQuery.isLoading,
    loading: businessesQuery.isLoading,
    error: businessesQuery.error,
    language,
    setLanguage: setLanguageState,
    t,
    notify,
    toasts,
    dismissToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider");
  }
  return context;
}
