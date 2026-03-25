import { useEffect } from 'react';
import { useGraphQuery } from '@/providers/api/graph';
import { graphStore } from './graph-store';

export function useGraphInitialLoad() {
  const { data, isLoading, error } = useGraphQuery();

  useEffect(() => {
    if (data) {
      graphStore.getState().hydrateFromServer(data);
    }
  }, [data]);

  return { isLoading, error };
}
