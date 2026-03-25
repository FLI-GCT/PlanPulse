import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Spinner,
  cn,
} from '@fli-dgtf/flow-ui';
import { useGraphQuery } from '@/providers/api/graph';
import { OfStatusBadge } from '@/components/shared/of-status-badge';
import { DateDisplay } from '@/components/shared/date-display';
import type { GraphNode, MarginResult } from '@/providers/state/graph-store';

const MAX_ROWS = 15;

function marginColorClass(floatTotal: number): string {
  if (floatTotal <= 0) return 'text-[var(--pp-red)] font-semibold';
  if (floatTotal <= 5) return 'text-[var(--pp-amber)] font-medium';
  return 'text-[var(--pp-green)]';
}

export function CriticalOfsTable() {
  const { data, isLoading } = useGraphQuery();

  const criticalOfs = useMemo(() => {
    if (!data) return [];

    const marginMap = new Map<string, MarginResult>();
    for (const m of (data.margins ?? []) as MarginResult[]) {
      marginMap.set(m.nodeId, m);
    }

    const ofNodes = (data.nodes as GraphNode[]).filter(
      (n) => n.type === 'of',
    );

    return ofNodes
      .map((node) => ({
        node,
        margin: marginMap.get(node.id) ?? null,
      }))
      .sort((a, b) => {
        const aFloat = a.margin?.floatTotal ?? Infinity;
        const bFloat = b.margin?.floatTotal ?? Infinity;
        // En retard first
        const aRetard = a.node.statut === 'EN_RETARD' ? 0 : 1;
        const bRetard = b.node.statut === 'EN_RETARD' ? 0 : 1;
        if (aRetard !== bRetard) return aRetard - bRetard;
        return aFloat - bFloat;
      })
      .slice(0, MAX_ROWS);
  }, [data]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base" style={{ color: 'var(--pp-navy)' }}>
          OFs les plus critiques
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : criticalOfs.length === 0 ? (
          <p
            className="py-8 text-center text-sm"
            style={{ color: 'var(--pp-text-secondary)' }}
          >
            Aucun OF trouve.
          </p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead>Debut</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Marge (j)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criticalOfs.map(({ node, margin }) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-mono text-xs">
                      {node.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{node.articleId ?? '-'}</TableCell>
                    <TableCell>
                      <DateDisplay date={node.dateDebut} />
                    </TableCell>
                    <TableCell>
                      <DateDisplay date={node.dateFin} />
                    </TableCell>
                    <TableCell>
                      <OfStatusBadge statut={node.statut} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        margin
                          ? marginColorClass(margin.floatTotal)
                          : 'text-[var(--pp-text-secondary)]',
                      )}
                    >
                      {margin ? margin.floatTotal : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
