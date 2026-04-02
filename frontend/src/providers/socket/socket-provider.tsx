import { useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { env } from '@/env';
import { SocketContext } from './socket-context';

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const s = io(env.WS_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    s.on('connect', () => {
      console.info('[PlanPulse WS] Connecte:', s.id);
      setIsConnected(true);
    });
    s.on('disconnect', (reason) => {
      console.warn('[PlanPulse WS] Deconnecte:', reason);
      setIsConnected(false);
    });
    s.on('connect_error', (err) => {
      console.error('[PlanPulse WS] Erreur connexion:', err.message);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
