import { useCallback } from 'react';
import { useSocket } from './socket-context';

export function useSocketEmit() {
  const { socket } = useSocket();

  return useCallback(
    (event: string, data: unknown) => {
      if (socket?.connected) {
        socket.emit(event, data);
      }
    },
    [socket],
  );
}
