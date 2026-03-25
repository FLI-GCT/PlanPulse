import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';

export type DependencyEdgeData = {
  typeLien: string;
  estCritique: boolean;
  quantite: number | null;
};

type DependencyEdgeType = Edge<DependencyEdgeData, 'dependencyEdge'>;

export function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps<DependencyEdgeType>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const isCritical = data?.estCritique ?? false;
  const isDashed = data?.typeLien === 'PARTAGE';
  const quantite = data?.quantite;

  const strokeColor = isCritical ? 'var(--pp-red)' : '#B0AFA8';
  const strokeWidth = isCritical ? 2.5 : 1.5;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isDashed ? '6 3' : undefined,
        }}
        markerEnd={`url(#arrow-${isCritical ? 'critical' : 'default'})`}
      />

      {/* Animated overlay for critical path */}
      {isCritical && (
        <path
          d={edgePath}
          fill="none"
          stroke="var(--pp-red)"
          strokeWidth={strokeWidth}
          strokeDasharray="8 4"
          style={{
            animation: 'dash-flow 1s linear infinite',
          }}
        />
      )}

      {/* Quantity label */}
      {quantite != null && (
        <foreignObject
          x={labelX - 16}
          y={labelY - 10}
          width={32}
          height={20}
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
          <div
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: 'var(--pp-text-secondary)',
              backgroundColor: 'var(--pp-surface)',
              border: '1px solid var(--pp-border)',
              borderRadius: '4px',
              padding: '1px 4px',
              textAlign: 'center',
              lineHeight: '16px',
            }}
          >
            {quantite}
          </div>
        </foreignObject>
      )}

      {/* SVG defs for arrow markers */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker
            id="arrow-default"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#B0AFA8" />
          </marker>
          <marker
            id="arrow-critical"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--pp-red)" />
          </marker>
        </defs>
      </svg>
    </>
  );
}
