import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label for the error display (e.g. "Explorer") */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React class component error boundary.
 * Catches render errors in child components and shows a fallback UI
 * instead of letting the whole app crash.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <div className="text-sm font-semibold text-gray-700">
            {this.props.label ? `${this.props.label} crashed` : 'Something went wrong'}
          </div>
          <pre className="text-xs text-red-600 bg-red-50 rounded p-3 max-w-lg text-left overflow-auto max-h-48 w-full">
            {this.state.error?.message}
          </pre>
          <button
            onClick={this.reset}
            className="btn-secondary text-xs"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
