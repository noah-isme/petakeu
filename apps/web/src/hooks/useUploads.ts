import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../api/client";

export function useUploads() {
  return useQuery({
    queryKey: ["uploads"],
    queryFn: () => apiClient.listUploads(),
    refetchInterval: 5000
  });
}

export function useUpload(uploadId: string | null) {
  return useQuery({
    queryKey: ["upload", uploadId],
    queryFn: () => apiClient.getUpload(uploadId as string),
    enabled: Boolean(uploadId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "processing" || status === "parsing" || status === "committing" || status === "parsed" ? 1500 : false;
    }
  });
}

export function useUploadRows(uploadId: string | null, page = 1, pageSize = 25) {
  return useQuery({
    queryKey: ["upload-rows", uploadId, page, pageSize],
    queryFn: () => apiClient.getUploadRows(uploadId as string, { page, pageSize }),
    enabled: Boolean(uploadId),
    placeholderData: (previousData) => previousData,
    // The worker may finish parsing after this query's first request. Keep
    // checking an empty page until staged rows are available; once rows are
    // present, the upload-status query owns the remaining lifecycle polling.
    refetchInterval: (query) => (query.state.data?.meta.total ?? 0) === 0 ? 1500 : false
  });
}
