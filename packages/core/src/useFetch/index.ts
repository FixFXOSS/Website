import { useState, useEffect, useCallback } from "react";

interface UseFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: any;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

interface UseFetchState<T, E> {
  data: T | null;
  error: E | null;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
}

export function useFetch<T = any, E = Error>(
  url: string,
  options?: UseFetchOptions,
  dependencies: any[] = []
) {
  const [state, setState] = useState<UseFetchState<T, E>>({
    data: null,
    error: null,
    isPending: true,
    isSuccess: false,
    isError: false,
  });

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, isPending: true }));
    console.log(`Fetching data from: ${url}`);

    try {
      // Prepare headers
      const headers = new Headers(options?.headers || {});
      if (options?.body && !headers.has("Content-Type")) {
        headers.append("Content-Type", "application/json");
      }

      // Prepare options
      const fetchOptions: RequestInit = {
        method: options?.method || "GET",
        headers,
        credentials: options?.credentials,
        cache: options?.cache,
        redirect: options?.redirect,
        referrer: options?.referrer,
        referrerPolicy: options?.referrerPolicy,
        integrity: options?.integrity,
        keepalive: options?.keepalive,
        signal: options?.signal,
      };

      // Add body if present
      if (options?.body) {
        fetchOptions.body = typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
      }

      // Execute fetch
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      setState({
        data,
        error: null,
        isPending: false,
        isSuccess: true,
        isError: false,
      });
      console.log(`Fetch completed successfully for: ${url}`);
    } catch (error) {
      console.error(`Fetch error for ${url}:`, error);
      setState({
        data: null,
        error: error as E,
        isPending: false,
        isSuccess: false,
        isError: true,
      });
    }
  }, [url, JSON.stringify(options), ...dependencies]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Allow manual refetching
  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, refetch };
}
