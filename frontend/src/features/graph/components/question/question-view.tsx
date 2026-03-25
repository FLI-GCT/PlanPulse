import { useState, useCallback } from 'react';
import { useQuestionMutation } from '@/providers/api/graph';
import { useGraphNavigation } from '../../hooks/use-graph-navigation';
import { QuestionSelector } from './question-selector';
import { QuestionBanner } from './question-banner';
import { QuestionGraph } from './question-graph';
import type { QuestionResponse } from './question-graph';

type ViewState =
  | { phase: 'selector' }
  | { phase: 'loading' }
  | { phase: 'result'; data: QuestionResponse };

export function QuestionView() {
  const [viewState, setViewState] = useState<ViewState>({ phase: 'selector' });
  const mutation = useQuestionMutation();
  const { goToQuestion } = useGraphNavigation();

  const handleSelect = useCallback(
    (type: string, targetId: string | null) => {
      setViewState({ phase: 'loading' });

      const questionLabels: Record<string, string> = {
        'why-late': 'Pourquoi en retard ?',
        'what-depends': 'Dependances',
        'critical-week': 'Critique cette semaine',
        'endangered-purchases': 'Achats en danger',
      };

      goToQuestion(
        type,
        targetId,
        questionLabels[type] ?? 'Question',
      );

      mutation.mutate(
        {
          type,
          ...(targetId ? { targetId } : {}),
        },
        {
          onSuccess: (data: QuestionResponse) => {
            setViewState({ phase: 'result', data });
          },
          onError: () => {
            // On error, go back to selector so the user can retry
            setViewState({ phase: 'selector' });
          },
        },
      );
    },
    [mutation, goToQuestion],
  );

  const handleNewQuestion = useCallback(() => {
    setViewState({ phase: 'selector' });
  }, []);

  return (
    <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
      {viewState.phase === 'selector' && (
        <QuestionSelector
          onSelect={handleSelect}
          isLoading={false}
        />
      )}

      {viewState.phase === 'loading' && (
        <QuestionSelector
          onSelect={handleSelect}
          isLoading={true}
        />
      )}

      {viewState.phase === 'result' && (
        <>
          <QuestionBanner
            question={viewState.data.question}
            answer={viewState.data.answer}
            onNewQuestion={handleNewQuestion}
          />
          <QuestionGraph questionResponse={viewState.data} />
        </>
      )}
    </div>
  );
}
