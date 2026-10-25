import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorPanel, PageSkeleton } from "./components/ui";
import { useApp } from "./context/AppContext";
import { BuyerPage, BuyerSupplierPage } from "./pages/Buyer";
import { DashboardPage } from "./pages/Dashboard";
import { FactorsPage } from "./pages/Factors";
import { NotFoundPage } from "./pages/NotFound";
import { OnboardingPage } from "./pages/Onboarding";
import { RecommendationsPage } from "./pages/Recommendations";
import { RecordDetailPage } from "./pages/RecordDetail";
import { RecordsPage } from "./pages/Records";
import { ReportPage } from "./pages/Report";
import { UploadPage } from "./pages/Upload";
import { VerifyQueuePage } from "./pages/VerifyQueue";
import { WelcomePage } from "./pages/Welcome";

function BusinessGate({ children }: { children: ReactNode }) {
  const { business, businesses, loading, error, selectBusiness, refreshBusinesses } = useApp();

  useEffect(() => {
    if (loading || businesses.length === 0 || business) return;
    selectBusiness(businesses[0].id);
  }, [loading, businesses, business, selectBusiness]);

  if (loading) return <PageSkeleton />;
  if (error) {
    return <ErrorPanel error={error} onRetry={() => void refreshBusinesses()} />;
  }
  if (businesses.length === 0) return <Navigate to="/" replace />;
  if (!business) return <PageSkeleton />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route element={<AppShell />}>
        <Route
          path="/dashboard"
          element={
            <BusinessGate>
              <DashboardPage />
            </BusinessGate>
          }
        />
        <Route
          path="/upload"
          element={
            <BusinessGate>
              <UploadPage />
            </BusinessGate>
          }
        />
        <Route
          path="/verify"
          element={
            <BusinessGate>
              <VerifyQueuePage />
            </BusinessGate>
          }
        />
        <Route
          path="/records"
          element={
            <BusinessGate>
              <RecordsPage />
            </BusinessGate>
          }
        />
        <Route
          path="/records/:recordId"
          element={
            <BusinessGate>
              <RecordDetailPage />
            </BusinessGate>
          }
        />
        <Route
          path="/recommendations"
          element={
            <BusinessGate>
              <RecommendationsPage />
            </BusinessGate>
          }
        />
        <Route
          path="/report"
          element={
            <BusinessGate>
              <ReportPage />
            </BusinessGate>
          }
        />
        <Route path="/factors" element={<FactorsPage />} />
        <Route path="/buyer" element={<BuyerPage />} />
        <Route path="/buyer/:buyerId/suppliers/:businessId" element={<BuyerSupplierPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
