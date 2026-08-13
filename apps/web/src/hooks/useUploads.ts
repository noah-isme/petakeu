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

export function useUploadRows(uploadId: string | null, page = 1, pageSize = 25, pollEmpty = true) {
  return useQuery({
    queryKey: ["upload-rows", uploadId, page, pageSize],
    queryFn: () => apiClient.getUploadRows(uploadId as string, { page, pageSize }),
    enabled: Boolean(uploadId),
    placeholderData: (previousData) => previousData,
    // The worker may finish parsing after this query's first request. Keep
    // checking an empty page until staged rows are available; once rows are
    // present, the upload-status query owns the remaining lifecycle polling.
    refetchInterval: (query) => pollEmpty && (query.state.data?.meta.total ?? 0) === 0 ? 1500 : false
  });
}

/**
 * Fetch the complete staged dataset so validation gates do not accidentally
 * inspect only the currently visible page. The page query remains separate
 * for rendering/pagination; this query is the authoritative aggregate used
 * by the confirmation workflow.
 */
export function useAllUploadRows(uploadId: string | null, pageSize = 25, pollEmpty = true) {
  return useQuery({
    queryKey: ["upload-rows-all", uploadId, pageSize],
    queryFn: async () => {
      const firstPage = await apiClient.getUploadRows(uploadId as string, { page: 1, pageSize });
      const totalPages = Math.max(firstPage.meta.totalPages, 1);
      if (totalPages === 1) return firstPage;

      const remainingPages = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.getUploadRows(uploadId as string, { page: index + 2, pageSize })
        )
      );

      return {
        data: [firstPage, ...remainingPages].flatMap((page) => page.data),
        meta: {
          ...firstPage.meta,
          page: 1,
          pageSize,
          totalPages
        }
      };
    },
    enabled: Boolean(uploadId),
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) => pollEmpty && (query.state.data?.meta.total ?? 0) === 0 ? 1500 : false
  });
}
