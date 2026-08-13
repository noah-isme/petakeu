import { describe, expect, it } from "vitest";

import { readUploadLocation, writeUploadLocation } from "../upload-workflow";

describe("resumable upload URL state", () => {
  it("restores upload and page from a direct-entry URL", () => {
    expect(readUploadLocation(new URLSearchParams("upload=upload-7&page=3"))).toEqual({ uploadId: "upload-7", page: 3 });
  });

  it("normalizes missing and invalid page values", () => {
    expect(readUploadLocation(new URLSearchParams("upload=upload-7&page=0"))).toEqual({ uploadId: "upload-7", page: 1 });
    expect(readUploadLocation(new URLSearchParams("page=not-a-number"))).toEqual({ uploadId: null, page: 1 });
  });

  it("preserves unrelated query parameters while moving through pages", () => {
    const params = writeUploadLocation(new URLSearchParams("period=2024-Q3"), "upload-7", 2);
    expect(params.toString()).toBe("period=2024-Q3&upload=upload-7&page=2");

    const reset = writeUploadLocation(params, null);
    expect(reset.toString()).toBe("period=2024-Q3");
  });
});
