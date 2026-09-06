import { Component, type ErrorInfo, type ReactNode } from "react";

type LazyLoadErrorBoundaryProps = {
  children: ReactNode;
  label?: string;
};

type LazyLoadErrorBoundaryState = {
  hasError: boolean;
};

/** Keeps a failed lazy chunk from leaving navigation or a match permanently blank. */
export class LazyLoadErrorBoundary extends Component<LazyLoadErrorBoundaryProps, LazyLoadErrorBoundaryState> {
  state: LazyLoadErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyLoadErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error("Lazy UI module failed to load.", error, info.componentStack);
  }

  private retry = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const label = this.props.label ?? "This screen";
    return (
      <section
        role="alert"
        style={{
          display: "grid",
          placeItems: "center",
          gap: "0.9rem",
          minHeight: "60vh",
          padding: "2rem",
          color: "var(--ui-text-color)",
          textShadow: "var(--ui-text-shadow)",
          textAlign: "center",
        }}
      >
        <p>{label} could not load.</p>
        <button type="button" onClick={this.retry}>Reload</button>
      </section>
    );
  }
}
