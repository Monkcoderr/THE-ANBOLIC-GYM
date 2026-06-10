"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

/**
 * useLeads — fetch unconverted leads.
 */
export function useLeads() {
  const { data, error, isLoading, mutate } = useSWR("/api/leads", fetcher, {
    dedupingInterval: 30000,
    revalidateOnFocus: false,
  });

  return {
    leads: data?.leads || [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
