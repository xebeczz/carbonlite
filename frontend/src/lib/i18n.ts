export type Lang = "en" | "ta";

const translations = {
  "nav.dashboard": ["Dashboard", "டாஷ்போர்டு"],
  "nav.upload": ["Upload bills", "பில்களைப் பதிவேற்று"],
  "nav.verify": ["Review", "சரிபார்க்க"],
  "nav.records": ["Records", "பதிவுகள்"],
  "nav.recommendations": ["Actions", "பரிந்துரைகள்"],
  "nav.report": ["Report", "அறிக்கை"],
  "nav.buyer": ["Buyer view", "வாங்குபவர் பார்வை"],
  "nav.factors": ["Emission factors", "உமிழ்வு காரணிகள்"],
  "common.electricity": ["Electricity", "மின்சாரம்"],
  "common.fuel": ["Fuel", "எரிபொருள்"],
  "common.lpg": ["LPG", "எல்.பி.ஜி"],
  "common.total": ["Total", "மொத்தம்"],
  "common.verified": ["Verified", "சரிபார்க்கப்பட்டது"],
  "common.pending": ["Needs review", "சரிபார்ப்பு தேவை"],
  "common.rejected": ["Rejected", "நிராகரிக்கப்பட்டது"],
  "common.upload": ["Upload", "பதிவேற்று"],
  "common.save": ["Save changes", "மாற்றங்களைச் சேமி"],
  "common.confirm": ["Confirm & count", "உறுதிசெய்து கணக்கிடு"],
  "common.reject": ["Reject", "நிராகரி"],
  "common.cancel": ["Cancel", "ரத்துசெய்"],
  "common.download": ["Download", "பதிவிறக்கு"],
  "common.view": ["View", "பார்"],
  "common.back": ["Back", "பின்செல்"],
  "common.continue": ["Continue", "தொடரவும்"],
  "common.retry": ["Try again", "மீண்டும் முயலவும்"],
  "common.loading": ["Loading", "ஏற்றுகிறது"],
  "common.confidence": ["Confidence", "நம்பிக்கை"],
  "common.source": ["Source", "மூலம்"],
  "common.period": ["Period", "காலம்"],
  "common.amount": ["Amount", "தொகை"],
  "common.vendor": ["Vendor", "விற்பனையாளர்"],
  "common.quantity": ["Quantity", "அளவு"],
  "common.status": ["Status", "நிலை"],
  "dashboard.title": ["Your carbon footprint", "உங்கள் கார்பன் தடம்"],
  "dashboard.total": ["Total emissions", "மொத்த உமிழ்வு"],
  "dashboard.monthly": ["Month by month", "மாதாந்திர உமிழ்வு"],
  "dashboard.breakdown": ["Where it comes from", "எங்கிருந்து வருகிறது"],
  "dashboard.quality": ["Data quality", "தரவுத் தரம்"],
  "dashboard.recent": ["Recent documents", "சமீபத்திய ஆவணங்கள்"],
  "upload.title": ["Add bills and receipts", "பில்கள் மற்றும் ரசீதுகளைச் சேர்"],
  "verify.title": ["Review the details", "விவரங்களைச் சரிபார்"],
  "records.title": ["Every record, every source", "ஒவ்வொரு பதிவும், ஒவ்வொரு மூலமும்"],
  "report.title": ["Supplier footprint report", "சப்ளையர் உமிழ்வு அறிக்கை"],
  "recommendations.title": ["Actions for your footprint", "உங்கள் தடத்திற்கான நடவடிக்கைகள்"],
  "buyer.title": ["Supplier footprint overview", "சப்ளையர் உமிழ்வு கண்ணோட்டம்"],
  "onboarding.title": ["Set up your business", "உங்கள் வணிகத்தை அமைக்கவும்"],
  "welcome.demo": ["Open the demo supplier", "டெமோ சப்ளையரைத் திற"],
  "welcome.setup": ["Set up my business", "என் வணிகத்தை அமை"],
} as const;

export type TranslationKey = keyof typeof translations;

export function translate(key: TranslationKey, lang: Lang): string {
  const entry = translations[key];
  return lang === "ta" ? entry[1] : entry[0];
}
