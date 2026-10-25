export type DocumentStatus = "uploaded" | "extracted" | "verified" | "rejected";
export type DocType = "electricity_bill" | "fuel_receipt" | "lpg_invoice" | "unknown";
export type FuelType = "diesel" | "petrol" | "lpg";

export interface Business {
  id: number;
  name: string;
  industry: string;
  location: string;
  language: string;
  reporting_period_start: string;
  reporting_period_end: string;
  units_produced: number | null;
  annual_revenue: number | null;
  currency: string;
  region: string;
  is_demo: boolean;
  created_at: string;
}

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  field: string | null;
  message: string;
}

export interface FactorSnapshot {
  id: number | null;
  activity_key: string;
  value: number | null;
  unit: string;
  source: string;
  source_version: string;
  year: number | null;
  region: string;
  status: string;
}

export interface EmissionResult {
  id: number;
  record_id: number;
  activity_key: string;
  quantity_used: number;
  unit_used: string;
  kg_co2e: number;
  tonnes_co2e: number;
  scope: 1 | 2;
  scope_label: string;
  scope_full_label: string;
  category: string;
  category_label: string;
  calc_method: "activity" | "spend_estimate";
  data_quality: "high" | "medium" | "low";
  data_quality_label: string;
  formula_text: string;
  factor: FactorSnapshot;
  created_at: string;
}

export interface RecordInfo {
  id: number;
  document_id: number;
  vendor: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  quantity: number | null;
  unit: string | null;
  amount: number | null;
  currency: string;
  fuel_type: FuelType | null;
  fuel_type_label: string | null;
  field_confidence: Record<string, number | null>;
  overall_confidence: number | null;
  low_confidence_fields: string[];
  user_edited: boolean;
  notes: string;
  validation_warnings: ValidationIssue[];
  created_at: string;
  updated_at: string;
  result: EmissionResult | null;
  document?: DocumentInfo;
  audit_logs?: AuditLogEntry[];
}

export interface DocumentInfo {
  id: number;
  business_id: number;
  original_filename: string;
  doc_type: DocType;
  doc_type_label: string;
  status: DocumentStatus;
  status_label: string;
  uploaded_at: string;
  mime_type: string;
  file_url: string;
  preview_url: string;
  extraction_method: string | null;
  extraction_method_label: string;
  extraction_error: string | null;
  duplicate_of: number | null;
  is_demo: boolean;
  record: RecordInfo | null;
}

export interface AuditLogEntry {
  id: number;
  entity: string;
  entity_id: number;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor: string;
  timestamp: string | null;
}

export interface ExtractionCapabilities {
  llm_configured: boolean;
  vision_model: string | null;
  text_model: string | null;
  ocr_available: boolean;
  pdf_reader_available: boolean;
  manual_entry_available: boolean;
}

export interface UploadResponse {
  document: DocumentInfo;
  record: RecordInfo;
  extraction: {
    method: string;
    method_label: string;
    provider: string | null;
    error: string | null;
    warnings: string[];
    manual_required: boolean;
    capabilities: ExtractionCapabilities;
  };
}

export interface VerifyResponse {
  document: DocumentInfo;
  record: RecordInfo;
  result: EmissionResult | null;
  warnings: ValidationIssue[];
  blocking: boolean;
  counted: boolean;
  calculation_error: { code: string; message: string } | null;
  message: string;
}

export interface UpdateRecordResponse {
  document: DocumentInfo;
  record: RecordInfo;
  result: EmissionResult | null;
  warnings: ValidationIssue[];
  blocking: boolean;
  counted: boolean;
  calculation_error: { code: string; message: string } | null;
  message: string;
}

export interface ScopeRow {
  scope: 1 | 2;
  label: string;
  kg_co2e: number;
  share: number;
}

export interface CategoryRow {
  category: string;
  label: string;
  scope: number;
  kg_co2e: number;
  share: number;
  spend_inr?: number | null;
  tonnes_co2e?: number;
}

export interface MonthlyRow {
  month: string;
  label: string;
  kg_co2e: number;
}

export interface FactorUsage {
  factor_id: number | null;
  activity_key: string;
  category_label: string;
  value: number | null;
  unit: string;
  source: string;
  source_version: string;
  year: number | null;
  region: string;
  status: string;
  notes: string;
  record_count: number;
}

export interface Dashboard {
  business: Business;
  totals: {
    kg_co2e: number;
    tonnes_co2e: number;
    record_count: number;
    top_emitter: {
      category: string;
      label: string;
      kg_co2e: number;
      share: number;
    } | null;
  };
  by_scope: ScopeRow[];
  by_category: CategoryRow[];
  monthly: MonthlyRow[];
  quality: {
    score: number;
    mix: { high: number; medium: number; low: number };
    spend_estimates: number;
    completeness_pct: number;
    verified_documents: number;
    pending_documents: number;
    rejected_documents: number;
    total_documents: number;
  };
  intensity: {
    units_produced: number | null;
    annual_revenue: number | null;
    kg_co2e_per_unit: number | null;
    kg_co2e_per_rupee: number | null;
  };
  factor_status: {
    mode: string;
    factors: FactorUsage[];
    has_unverified: boolean;
    has_demo: boolean;
    notice: string | null;
    blocked: boolean;
  };
  calculation_errors: Array<{
    document_id: number;
    record_id: number | null;
    vendor?: string | null;
    message: string;
  }>;
  demo: boolean;
  recent_records: DocumentInfo[];
  pending_documents: number;
}

export interface RecommendationItem {
  title: string;
  action: string;
  why: string;
  category: string;
  est_tonnes_saved: number | null;
  est_rs_saved: number | null;
  assumptions: string[];
  effort: "low" | "medium" | "high";
  estimate?: boolean;
}

export interface RecommendationBasis {
  business: string;
  industry: string;
  location: string;
  reporting_period: { start: string; end: string };
  total_tonnes_co2e: number;
  categories: CategoryRow[];
  quality_score: number;
  completeness_pct: number;
  monthly: MonthlyRow[];
}

export interface RecommendationSet {
  id: number;
  method: string;
  method_label: string;
  generated_at: string;
  notice: string | null;
  summary: string;
  items: RecommendationItem[];
  disclaimer: string;
  basis: RecommendationBasis;
}

export interface RecommendationsResponse {
  business_id: number;
  has_recommendations: boolean;
  recommendations: RecommendationSet | null;
}

export interface ReportAuditRow {
  document: {
    id: number;
    original_filename: string;
    doc_type: DocType;
    status: DocumentStatus;
    uploaded_at: string | null;
    extraction_method: string | null;
    is_demo: boolean;
  };
  record: {
    id: number | null;
    vendor: string | null;
    billing_period_start: string | null;
    billing_period_end: string | null;
    quantity: number | null;
    unit: string | null;
    amount: number | null;
    currency: string;
    fuel_type: string | null;
    overall_confidence: number | null;
    user_edited: boolean;
  };
  result: EmissionResult | null;
  counted: boolean;
}

export interface ReportPayload {
  business: Business;
  period: { start: string; end: string };
  generated_at: string;
  totals: Dashboard["totals"];
  by_scope: ScopeRow[];
  by_category: CategoryRow[];
  monthly: MonthlyRow[];
  quality: Dashboard["quality"];
  intensity: Dashboard["intensity"];
  factor_status: Dashboard["factor_status"];
  factors: FactorUsage[];
  recommendations: RecommendationSet | null;
  audit: {
    rows: ReportAuditRow[];
    counted: number;
    pending: number;
    rejected: number;
  };
  completeness_pct: number;
  demo: boolean;
  watermark: string | null;
  can_finalize: boolean;
  block_reason: string | null;
  problems: string[];
  methodology: string[];
  limitations: string[];
}

export interface BuyerSummary {
  business: Business;
  link_status: string;
  total_tonnes: number;
  by_scope: ScopeRow[];
  scope_1_kg: number;
  scope_2_kg: number;
  top_emitter: Dashboard["totals"]["top_emitter"];
  quality_score: number;
  completeness_pct: number;
  verified_documents: number;
  pending_documents: number;
  total_documents: number;
  factor_notice: string | null;
  blocked: boolean;
  is_demo: boolean;
  period: { start: string; end: string };
}

export interface BuyerOverview {
  buyer: { id: number; name: string; is_demo: boolean };
  suppliers: BuyerSummary[];
  totals: {
    supplier_count: number;
    total_tonnes: number;
    scope_1_kg: number;
    scope_2_kg: number;
    average_completeness: number;
    average_quality: number;
    verified_documents: number;
    pending_documents: number;
  };
}

export type BuyerDashboard = Omit<Dashboard, "recent_records" | "calculation_errors">;

export interface BuyerSupplierDetail {
  buyer: BuyerOverview["buyer"];
  link_status: string;
  dashboard: BuyerDashboard;
}

export interface FactorRow {
  id: number;
  activity_key: string;
  unit: string;
  factor_kg_co2e_per_unit: number | null;
  source: string;
  source_version: string;
  year: number;
  region: string;
  notes: string;
  status: string;
}

export interface FactorTableResponse {
  mode: string;
  factor_file?: string;
  notice: string;
  counts: {
    total: number;
    verified: number;
    demo: number;
    unverified: number;
  };
  factors: FactorRow[];
}

export interface SampleDocument {
  kind: string;
  label: string;
  description: string;
  filename: string;
  available: boolean;
  pdf_url: string;
  png_url: string | null;
}

export interface Meta {
  app: string;
  version: string;
  factor_mode: string;
  auto_seed: boolean;
  limits: { max_upload_mb: number };
  extraction: ExtractionCapabilities;
  demo: {
    businesses: Array<{ id: number; name: string }>;
    buyers: Array<{ id: number; name: string }>;
  };
  counts: { businesses: number; documents: number; factors: number };
  samples: SampleDocument[];
}

export interface ApiErrorDetail {
  message?: string;
  code?: string;
  issues?: ValidationIssue[];
  problems?: string[];
  existing_document_id?: number;
  [key: string]: unknown;
}
