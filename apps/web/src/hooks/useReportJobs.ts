import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../api/client";

export function useReportJobs() {
  return useQuery({
    queryKey: ["report-jobs"],
    queryFn: () => apiClient.listReportJobs(),
    refetchInterval: 6000
  });
}
