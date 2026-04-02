import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScaleTime } from 'd3-scale';
import { parseISO, differenceInCalendarDays } from 'date-fns';

import { useGraphStore } from '@/providers/state/graph-store';
import type { GraphNode, PropagationResult } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';
import { useSocket } from '@/providers/socket/socket-context';
import { useSocketEmit } from '@/providers/socket/use-socket-emit';
import { useSocketEvent } from '@/providers/socket/use-socket-event';

import type { DragSession, PendingMove } from '@/features/gantt/gantt-layout';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGanttDrag(xScale: ScaleTime<number, number>) {
  const nodes = useGraphStore((s) => s.nodes);
  const propagationPreview = useGraphStore((s) => s.propagationPreview);
  const applyPreview = useGraphStore((s) => s.applyPreview);
  const clearPreview = useGraphStore((s) => s.clearPreview);

  const startDragStore = useUiStore((s) => s.startDrag);
  const endDragStore = useUiStore((s) => s.endDrag);

  const { isConnected } = useSocket();
  const emit = useSocketEmit();

  // Refs for drag
  const dragRef = useRef<DragSession | null>(null);
  const requestIdRef = useRef(0);
  const lastEmittedRequestIdRef = useRef(0);
  const rafRef = useRef<number>(0);

  // Drag visual state (only the delta in pixels, for re-render)
  const [dragDelta, setDragDelta] = useState<{ nodeId: string; deltaPx: number } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // ---- Socket event: preview result ----

  const handlePreviewResult = useCallback(
    (data: { requestId: number; impactedNodes: PropagationResult[] }) => {
      if (data.requestId >= lastEmittedRequestIdRef.current) {
        applyPreview(data.impactedNodes);
      }
    },
    [applyPreview],
  );

  useSocketEvent('of:move-preview-result', handlePreviewResult);

  // ---- Drag handlers ----

  const handleDragStart = useCallback(
    (nodeId: string, startClientX: number) => {
      if (!isConnected) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      requestIdRef.current += 1;
      const reqId = requestIdRef.current;

      dragRef.current = {
        nodeId,
        startClientX,
        startDateDebut: parseISO(node.dateDebut),
        currentDeltaPx: 0,
        lastEmitTime: 0,
      };

      startDragStore(nodeId, reqId);
      setDragDelta({ nodeId, deltaPx: 0 });
    },
    [isConnected, nodes, startDragStore],
  );

  // Global mouse move & up for drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaPx = e.clientX - drag.startClientX;
      drag.currentDeltaPx = deltaPx;

      // Update visual via rAF
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setDragDelta({ nodeId: drag.nodeId, deltaPx });
      });

      // Throttle emission to 100ms
      const now = Date.now();
      if (now - drag.lastEmitTime < 100) return;
      drag.lastEmitTime = now;

      // Convert pixel delta to date
      const newDate = xScale.invert(xScale(drag.startDateDebut) + deltaPx);
      requestIdRef.current += 1;
      const reqId = requestIdRef.current;
      lastEmittedRequestIdRef.current = reqId;

      emit('of:move-preview', {
        requestId: reqId,
        ofId: drag.nodeId,
        newDateDebut: newDate.toISOString(),
      });
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;

      // Calculate final delta in days
      const newDate = xScale.invert(xScale(drag.startDateDebut) + drag.currentDeltaPx);
      const deltaDays = differenceInCalendarDays(newDate, drag.startDateDebut);

      dragRef.current = null;
      endDragStore();

      if (deltaDays === 0) {
        // No real move, clear preview
        clearPreview();
        setDragDelta(null);
        return;
      }

      // Show confirmation dialog
      setPendingMove({
        nodeId: drag.nodeId,
        deltaJours: deltaDays,
        impactedNodes: propagationPreview ?? [],
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [xScale, emit, endDragStore, clearPreview, propagationPreview]);

  // ---- Confirm / Cancel move ----

  const handleConfirmMove = useCallback(() => {
    if (!pendingMove) return;
    emit('of:move-commit', {
      ofId: pendingMove.nodeId,
      deltaJours: pendingMove.deltaJours,
    });
    clearPreview();
    setDragDelta(null);
    setPendingMove(null);
  }, [pendingMove, emit, clearPreview]);

  const handleCancelMove = useCallback(() => {
    clearPreview();
    setDragDelta(null);
    setPendingMove(null);
  }, [clearPreview]);

  return {
    dragDelta,
    pendingMove,
    handleDragStart,
    handleConfirmMove,
    handleCancelMove,
    previewNodes: propagationPreview,
    isConnected,
  };
}
