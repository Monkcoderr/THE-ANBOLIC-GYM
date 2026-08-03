"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { LIST_SWR_CONFIG } from "@/lib/swrConfig";

/**
 * useMembers — fetch the member list, optionally with search/status params.
 */
export function useMembers(params = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const key = `/api/members${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, LIST_SWR_CONFIG);

  return {
    members: data?.members || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 1,
    page: data?.page || 1,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
