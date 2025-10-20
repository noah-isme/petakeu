import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../api/client";

export function useUploads() {
  return useQuery({
    queryKey: ["uploads"],
    queryFn: () => apiClient.listUploads(),
    refetchInterval: 5000
  });
}
