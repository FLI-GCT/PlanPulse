import { ChevronRightIcon, MapIcon } from 'lucide-react';
import { useGraphNavigation } from '../hooks/use-graph-navigation';

export function GraphBreadcrumb() {
  const { graphNav, goToStrategic, goBack } = useGraphNavigation();
  const { breadcrumb } = graphNav;

  if (breadcrumb.length <= 1) return null;

  return (
    <nav
      className="flex shrink-0 items-center gap-1 border-b px-6 py-2 text-sm"
      style={{
        borderColor: 'var(--pp-border)',
        backgroundColor: 'var(--pp-surface)',
      }}
    >
      <MapIcon
        className="mr-1 h-4 w-4"
        style={{ color: 'var(--pp-text-secondary)' }}
      />

      {breadcrumb.map((segment, index) => {
        const isLast = index === breadcrumb.length - 1;

        return (
          <span key={`${segment.level}-${index}`} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRightIcon
                className="h-3.5 w-3.5"
                style={{ color: 'var(--pp-text-secondary)' }}
              />
            )}
            {isLast ? (
              <span
                className="font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                {segment.label}
              </span>
            ) : (
              <button
                className="cursor-pointer rounded px-1 py-0.5 transition-colors hover:underline"
                style={{ color: 'var(--pp-blue)' }}
                onClick={() => {
                  if (segment.level === '1') {
                    goToStrategic();
                  } else {
                    // Navigate back to this level
                    goBack();
                  }
                }}
              >
                {segment.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
