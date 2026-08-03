/**
 * Shared SWR config for list endpoints (members, leads).
 *
 * - dedupingInterval: collapse duplicate requests fired within 30s
 * - revalidateOnFocus: off — this is a single-owner internal tool, so tab
 *   focus churn shouldn't trigger refetches
 * - revalidateOnReconnect: refresh when the network comes back
 * - keepPreviousData: keep showing the current list while a new key loads,
 *   avoiding a skeleton flash on search/param changes
 */
export const LIST_SWR_CONFIG = {
  dedupingInterval: 30000,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  keepPreviousData: true,
};
