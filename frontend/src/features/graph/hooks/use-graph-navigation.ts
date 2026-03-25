import { useCallback } from 'react';
import { useUiStore } from '@/providers/state/ui-store';

export function useGraphNavigation() {
  const graphNav = useUiStore((s) => s.graphNav);
  const setGraphNav = useUiStore((s) => s.setGraphNav);

  const goToStrategic = useCallback(() => {
    setGraphNav({
      level: 1,
      commandOfFinalId: null,
      focusNodeId: null,
      questionType: null,
      questionTargetId: null,
      breadcrumb: [{ level: '1', label: 'Vue strategique' }],
    });
  }, [setGraphNav]);

  const goToCommand = useCallback(
    (ofFinalId: string, clientLabel: string) => {
      setGraphNav({
        level: 2,
        commandOfFinalId: ofFinalId,
        focusNodeId: null,
        questionType: null,
        questionTargetId: null,
        breadcrumb: [
          { level: '1', label: 'Vue strategique' },
          { level: '2', label: clientLabel },
        ],
      });
    },
    [setGraphNav],
  );

  const goToFocus = useCallback(
    (nodeId: string, nodeLabel: string) => {
      setGraphNav({
        level: '3a',
        focusNodeId: nodeId,
        breadcrumb: [
          ...graphNav.breadcrumb.slice(0, 2),
          { level: '3a', label: nodeLabel },
        ],
      });
    },
    [setGraphNav, graphNav.breadcrumb],
  );

  const goToQuestion = useCallback(
    (type: string, targetId: string | null, label: string) => {
      setGraphNav({
        level: '3b',
        questionType: type,
        questionTargetId: targetId,
        breadcrumb: [
          ...graphNav.breadcrumb.slice(0, 2),
          { level: '3b', label },
        ],
      });
    },
    [setGraphNav, graphNav.breadcrumb],
  );

  const goBack = useCallback(() => {
    if (graphNav.breadcrumb.length <= 1) return;
    const newBreadcrumb = graphNav.breadcrumb.slice(0, -1);
    const lastLevel = newBreadcrumb[newBreadcrumb.length - 1]?.level ?? '1';
    setGraphNav({
      level:
        lastLevel === '1' ? 1 : lastLevel === '2' ? 2 : (lastLevel as '3a' | '3b'),
      breadcrumb: newBreadcrumb,
    });
  }, [setGraphNav, graphNav.breadcrumb]);

  return { graphNav, goToStrategic, goToCommand, goToFocus, goToQuestion, goBack };
}
