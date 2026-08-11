import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../api/client";

import type { AuditLogQuery } from "../types/audit";

export function useAuditLogs(params: AuditLogQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => apiClient.listAuditLogs(params),
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
    staleTime: 10_000
  });
}
