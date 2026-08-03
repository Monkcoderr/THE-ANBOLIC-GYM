"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { LIST_SWR_CONFIG } from "@/lib/swrConfig";

/**
 * useLeads — fetch unconverted leads.
 */
export function useLeads() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/leads",
    fetcher,
    LIST_SWR_CONFIG
  );

  return {
    leads: data?.leads || [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
