import type {
  ApiErrorDetail,
  AuditLogEntry,
  Business,
  BuyerOverview,
  BuyerSupplierDetail,
  Dashboard,
  DocumentInfo,
  FactorTableResponse,
  Meta,
  RecommendationsResponse,
  RecommendationSet,
  RecordInfo,
  ReportPayload,
  SampleDocument,
  UpdateRecordResponse,
  UploadResponse,
  ValidationIssue,
  VerifyResponse,
} from "./types";

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
export const API_BASE = RAW_BASE.replace(/\/$/, "");

export class ApiClientError extends Error {
  status: number;
  detail: ApiErrorDetail | string | null;
  code?: string;
  issues?: ValidationIssue[];
  problems?: string[];
  existingDocumentId?: number;

  constructor(
    message: string,
    status: number,
    detail: ApiErrorDetail | string | null = null,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.detail = detail;
    if (detail && typeof detail === "object") {
      this.code = typeof detail.code === "string" ? detail.code : undefined;
      this.issues = Array.isArray(detail.issues) ? detail.issues : undefined;
      this.problems = Array.isArray(detail.problems)
        ? (detail.problems as string[])
        : undefined;
      this.existingDocumentId =
        typeof detail.existing_document_id === "number"
          ? detail.existing_document_id
          : undefined;
    }
  }
}

async function readError(response: Response): Promise<ApiClientError> {
  let detail: ApiErrorDetail | string | null = null;
  try {
    const payload = await response.json();
    detail = payload?.detail ?? payload ?? null;
  } catch {
    detail = null;
  }
  let message = `Request failed (${response.status}).`;
  if (typeof detail === "string") {
    message = detail;
  } else if (detail && typeof detail === "object") {
    if (typeof detail.message === "string") {
      message = detail.message;
    } else if (Array.isArray(detail.errors) && detail.errors.length > 0) {
      const first = detail.errors[0] as { message?: string };
      message = first?.message || message;
    }
  }
  return new ApiClientError(message, response.status, detail);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function formatApiError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.issues && error.issues.length > 0) {
      return error.issues.map((issue) => issue.message).join(" ");
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export async function getMeta(): Promise<Meta> {
  return apiFetch<Meta>("/meta");
}

export async function getBusinesses(): Promise<Business[]> {
  return apiFetch<Business[]>("/businesses");
}

export interface BusinessCreatePayload {
  name: string;
  industry: string;
  location: string;
  language: string;
  reporting_period_start: string;
  reporting_period_end: string;
  units_produced: number | null;
  annual_revenue: number | null;
}

export async function createBusiness(payload: BusinessCreatePayload): Promise<Business> {
  return apiFetch<Business>("/business", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getDashboard(businessId: number): Promise<Dashboard> {
  return apiFetch<Dashboard>(`/dashboard/${businessId}`);
}

export async function recalculate(businessId: number): Promise<{
  calculated: number;
  errors: Array<{ message: string }>;
  message: string;
}> {
  return apiFetch(`/calculate/${businessId}`, { method: "POST" });
}

export async function listDocuments(
  businessId: number,
  status?: string,
): Promise<DocumentInfo[]> {
  const params = new URLSearchParams({ business_id: String(businessId) });
  if (status) params.set("status", status);
  return apiFetch<DocumentInfo[]>(`/documents?${params}`);
}

export async function uploadDocument(
  businessId: number,
  file: File,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<UploadResponse>(`/documents/upload?business_id=${businessId}`, {
    method: "POST",
    body: form,
  });
}

export async function listRecords(
  businessId: number,
  status?: string,
): Promise<RecordInfo[]> {
  const params = new URLSearchParams({ business_id: String(businessId) });
  if (status) params.set("status", status);
  return apiFetch<RecordInfo[]>(`/records?${params}`);
}

export async function getRecord(recordId: number): Promise<RecordInfo> {
  return apiFetch<RecordInfo>(`/records/${recordId}`);
}

export interface RecordEditPayload {
  vendor?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  quantity?: number | null;
  unit?: string | null;
  amount?: number | null;
  currency?: string | null;
  fuel_type?: "diesel" | "petrol" | "lpg" | null;
  doc_type?: "electricity_bill" | "fuel_receipt" | "lpg_invoice" | "unknown";
  notes?: string | null;
}

export async function updateRecord(
  recordId: number,
  payload: RecordEditPayload,
): Promise<UpdateRecordResponse> {
  return apiFetch<UpdateRecordResponse>(`/records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function verifyRecord(recordId: number): Promise<VerifyResponse> {
  return apiFetch<VerifyResponse>(`/records/${recordId}/verify`, { method: "POST" });
}

export async function rejectRecord(recordId: number): Promise<VerifyResponse> {
  return apiFetch<VerifyResponse>(`/records/${recordId}/reject`, { method: "POST" });
}

export async function reopenRecord(recordId: number): Promise<UpdateRecordResponse> {
  return apiFetch<UpdateRecordResponse>(`/records/${recordId}/reopen`, { method: "POST" });
}

export async function getBusinessAudit(
  businessId: number,
  limit = 200,
): Promise<AuditLogEntry[]> {
  return apiFetch<AuditLogEntry[]>(`/business/${businessId}/audit?limit=${limit}`);
}

export async function getRecommendations(
  businessId: number,
): Promise<RecommendationsResponse> {
  return apiFetch<RecommendationsResponse>(`/recommendations/${businessId}`);
}

export async function generateRecommendations(
  businessId: number,
): Promise<RecommendationSet> {
  return apiFetch<RecommendationSet>(`/recommendations/${businessId}`, {
    method: "POST",
  });
}

export async function getReport(businessId: number): Promise<ReportPayload> {
  return apiFetch<ReportPayload>(`/report/${businessId}`);
}

export async function getBuyers(): Promise<Array<{ id: number; name: string; is_demo: boolean }>> {
  return apiFetch("/buyers");
}

export async function getBuyerOverview(buyerId: number): Promise<BuyerOverview> {
  return apiFetch<BuyerOverview>(`/buyer/${buyerId}/suppliers`);
}

export async function getBuyerSupplierDetail(
  buyerId: number,
  businessId: number,
): Promise<BuyerSupplierDetail> {
  return apiFetch<BuyerSupplierDetail>(
    `/buyer/${buyerId}/suppliers/${businessId}`,
  );
}

export async function getFactors(): Promise<FactorTableResponse> {
  return apiFetch<FactorTableResponse>("/factors");
}

export async function reloadFactors(): Promise<FactorTableResponse> {
  return apiFetch<FactorTableResponse>("/factors/reload", { method: "POST" });
}

export async function fetchSampleAsFile(sample: SampleDocument): Promise<File> {
  const response = await fetch(mediaUrl(sample.pdf_url));
  if (!response.ok) {
    throw new ApiClientError(
      "The sample document is not available. Run the sample generator and try again.",
      response.status,
    );
  }
  const blob = await response.blob();
  return new File([blob], sample.filename, { type: "application/pdf" });
}

export async function downloadReport(
  businessId: number,
  format: "pdf" | "csv",
): Promise<string> {
  const response = await fetch(`${API_BASE}/report/${businessId}/${format}`);
  if (!response.ok) {
    throw await readError(response);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] || `carbonlite-report-${businessId}.${format}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
