import { useSocket } from '@/providers/socket/socket-context';

export function ConnectionBanner() {
  const { isConnected } = useSocket();

  if (isConnected) return null;

  return (
    <div
      className='fixed top-0 right-0 left-0 z-50 px-4 py-2 text-center text-sm font-medium text-white'
      style={{ backgroundColor: 'var(--pp-red)' }}
    >
      Connexion perdue, reconnexion en cours...
    </div>
  );
}
