export interface UploadLocation {
  uploadId: string | null;
  page: number;
}

export function readUploadLocation(params: URLSearchParams): UploadLocation {
  const parsedPage = Number(params.get("page"));
  return {
    uploadId: params.get("upload"),
    page: Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1
  };
}

export function writeUploadLocation(params: URLSearchParams, uploadId: string | null, page = 1): URLSearchParams {
  const nextParams = new URLSearchParams(params);
  if (uploadId) nextParams.set("upload", uploadId);
  else nextParams.delete("upload");
  if (page > 1) nextParams.set("page", String(Math.floor(page)));
  else nextParams.delete("page");
  return nextParams;
}
