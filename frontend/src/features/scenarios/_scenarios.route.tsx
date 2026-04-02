import { createFileRoute } from '@tanstack/react-router';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from '@fli-dgtf/flow-ui';
import { GitBranchIcon, PlusIcon, FlaskConicalIcon } from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/error-boundary';

export const Route = createFileRoute('/_layout/scenarios')({
  component: ScenariosView,
});

function ScenariosView() {
  return (
    <ErrorBoundary>
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranchIcon
            className="h-6 w-6"
            style={{ color: 'var(--pp-navy)' }}
          />
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--pp-navy)' }}
          >
            Scenarios What-If
          </h1>
        </div>
        <Button
          onClick={() => {
            toast.info('Fonctionnalite bientot disponible');
          }}
        >
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Nouveau scenario
        </Button>
      </div>

      {/* Empty state */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle
            className="text-base"
            style={{ color: 'var(--pp-navy)' }}
          >
            Vos scenarios
          </CardTitle>
        </CardHeader>
        <CardContent className="py-12">
          <Empty className="mx-auto max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FlaskConicalIcon
                  className="h-10 w-10"
                  style={{ color: 'var(--pp-blue)' }}
                />
              </EmptyMedia>
              <EmptyTitle>Aucun scenario</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>
                Les scenarios what-if vous permettent de simuler des
                modifications du plan de production sans affecter le plan reel.
                Creez un scenario pour tester l'impact d'un deplacement d'OF,
                d'un retard fournisseur ou d'un changement de priorite.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </div>
    </ErrorBoundary>
  );
}
