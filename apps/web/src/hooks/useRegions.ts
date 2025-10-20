import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../api/client";
import type { RegionLevel } from "../types/region";

interface UseRegionsParams {
  level?: RegionLevel;
  parent?: string;
}

export function useRegions(params: UseRegionsParams = {}) {
  return useQuery({
    queryKey: ["regions", params],
    queryFn: () => apiClient.getRegions(params),
    staleTime: 5 * 60 * 1000
  });
}
