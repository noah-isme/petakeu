import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../api/client";

interface UseRegionSummaryParams {
  regionId?: string;
  from?: string;
  to?: string;
}

export function useRegionSummary({ regionId, ...range }: UseRegionSummaryParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["region-summary", regionId, range.from ?? null, range.to ?? null],
    queryFn: () => {
      if (!regionId) {
        return Promise.reject(new Error("Missing regionId"));
      }
      return apiClient.getRegionSummary(regionId, range);
    },
    enabled: (options?.enabled ?? true) && Boolean(regionId),
    keepPreviousData: true
  });
}
