import React, { type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@fli-dgtf/flow-ui';
import { AlertTriangleIcon, RefreshCwIcon, CopyIcon } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <DefaultErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({ error }: { error: Error | null }) {
  const handleReload = () => window.location.reload();
  const handleCopy = () => {
    const text = `PlanPulse Error:\n${error?.message}\n\n${error?.stack}`;
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div
        className="flex max-w-md flex-col items-center gap-4 rounded-xl border p-8 text-center"
        style={{ borderColor: 'var(--pp-border)', backgroundColor: 'var(--pp-surface)' }}
      >
        <AlertTriangleIcon className="h-12 w-12" style={{ color: 'var(--pp-red)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--pp-navy)' }}>
          Une erreur est survenue
        </h2>
        <p className="text-sm" style={{ color: 'var(--pp-text-secondary)' }}>
          {error?.message ?? 'Erreur inconnue'}
        </p>
        <div className="flex gap-3">
          <Button onClick={handleReload}>
            <RefreshCwIcon className="mr-1.5 h-4 w-4" />
            Recharger
          </Button>
          <Button variant="tertiary" onClick={handleCopy}>
            <CopyIcon className="mr-1.5 h-4 w-4" />
            Copier l'erreur
          </Button>
        </div>
      </div>
    </div>
  );
}
