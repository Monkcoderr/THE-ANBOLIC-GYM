"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

/**
 * useAnalytics — fetch revenue + member stats (cached 5 minutes).
 */
export function useAnalytics() {
  const { data, error, isLoading, mutate } = useSWR("/api/analytics", fetcher, {
    dedupingInterval: 300000,
    revalidateOnFocus: false,
  });

  return {
    analytics: data || null,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
