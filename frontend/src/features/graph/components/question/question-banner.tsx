import { Button } from '@fli-dgtf/flow-ui';
import { RefreshCcwIcon } from 'lucide-react';

export interface QuestionBannerProps {
  question: string;
  answer: string;
  onNewQuestion: () => void;
}

export function QuestionBanner({
  question,
  answer,
  onNewQuestion,
}: QuestionBannerProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-4 border-b px-6 py-3"
      style={{
        backgroundColor: '#EFF6FF',
        borderColor: '#BFDBFE',
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--pp-navy)' }}
        >
          {question}
        </span>
        <span
          className="text-sm"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          {answer}
        </span>
      </div>

      <Button size="sm" variant="outline" onClick={onNewQuestion}>
        <RefreshCcwIcon className="mr-1.5 h-3.5 w-3.5" />
        Poser une autre question
      </Button>
    </div>
  );
}
