import { useEffect, useState } from 'react';
import { useSocket } from '@/providers/socket/socket-context';

export function ConnectionBanner() {
  const { isConnected } = useSocket();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setShowBanner(false);
      return;
    }

    // Grace period: don't show the banner during initial connection (3s)
    const timer = setTimeout(() => {
      if (!isConnected) setShowBanner(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isConnected]);

  if (!showBanner) return null;

  return (
    <div
      className='fixed top-0 right-0 left-0 z-50 px-4 py-2 text-center text-sm font-medium text-white'
      style={{ backgroundColor: 'var(--pp-red)' }}
    >
      Connexion perdue, reconnexion en cours...
    </div>
  );
}
