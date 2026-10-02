import { useCallback, useEffect, useRef, useState } from "react";

export interface Resource<T> {
  data?: T;
  error?: Error;
  loading: boolean;
  stale: boolean;
  refetch: () => void;
}

/** Retain data only while refreshing the same resource key. */
export function useResource<T>(
  load: () => Promise<T>,
  key: string,
): Resource<T> {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    revision: number;
    data?: T;
    error?: Error;
    loading: boolean;
  }>({ key, revision: 0, loading: true });
  const loadRef = useRef(load);
  const activeRequest = useRef<symbol | undefined>(undefined);
  loadRef.current = load;
  const refetch = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    // Identity, not key/revision text: A → B → A must not revive the first A request.
    const requestId = Symbol();
    activeRequest.current = requestId;
    setState((current) => ({
      key,
      revision,
      data: current.key === key ? current.data : undefined,
      loading: true,
    }));
    const loadCurrent = async () => {
      try {
        const value = await loadRef.current();
        setState((current) =>
          activeRequest.current === requestId
            ? { key, revision, data: value, loading: false }
            : current,
        );
      } catch (reason) {
        setState((current) =>
          activeRequest.current === requestId
            ? {
                ...current,
                error:
                  reason instanceof Error
                    ? reason
                    : new Error("Request failed"),
                loading: false,
              }
            : current,
        );
      }
    };
    void loadCurrent();
    return () => {
      if (activeRequest.current === requestId)
        activeRequest.current = undefined;
    };
  }, [key, revision]);

  // Mask mismatched state during render; waiting for the effect would expose old data.
  const sameKey = state.key === key;
  const data = sameKey ? state.data : undefined;
  const error =
    sameKey && state.revision === revision ? state.error : undefined;
  const loading = !sameKey || state.revision !== revision || state.loading;
  return {
    data,
    error,
    loading,
    stale: data !== undefined && (loading || error !== undefined),
    refetch,
  };
}
