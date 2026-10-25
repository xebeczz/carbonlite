import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("CarbonLite UI error", error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand px-5 py-12">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-card">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fbeceb] text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-forest">
            Something broke in the interface
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Your saved business and records are safe on the server. Reload to continue; if it keeps
            happening, check the browser console for the underlying error.
          </p>
          <p className="mt-3 rounded-lg bg-sand p-2.5 font-mono text-[10px] leading-4 text-ink-muted">
            {this.state.error.message || "Unknown error"}
          </p>
          <button type="button" className="btn-primary mt-5" onClick={this.reload}>
            <RotateCcw className="h-4 w-4" /> Reload CarbonLite
          </button>
        </div>
      </div>
    );
  }
}
