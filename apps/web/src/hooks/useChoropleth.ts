import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../api/client";

export function useChoropleth(period: string) {
  return useQuery({
    queryKey: ["choropleth", period],
    queryFn: () => apiClient.getChoropleth(period),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previousData) => previousData
  });
}
