import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ margin: 24 }} role="alert">
        <h2>Something broke</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error.stack || this.state.error)}</pre>
        <button
          onClick={() => {
            try {
              localStorage.removeItem('camp-trip-planner:v1');
            } catch {
              /* ignore */
            }
            location.reload();
          }}
        >
          Start over
        </button>
      </div>
    );
  }
}
