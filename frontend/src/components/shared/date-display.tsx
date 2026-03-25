import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

export function DateDisplay({ date }: { date: string }) {
  try {
    return <span>{format(parseISO(date), 'dd/MM/yyyy', { locale: fr })}</span>;
  } catch {
    return <span>{date}</span>;
  }
}
