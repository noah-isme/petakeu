import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../../api/client";

interface UploadFormProps {
  onUploaded?: (uploadId: string) => void;
}

export function UploadForm({ onUploaded }: UploadFormProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.uploadFile(formData);
    },
    onSuccess: (result) => {
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
      onUploaded?.(result.uploadId);
      queryClient.invalidateQueries({ queryKey: ["uploads"] }).catch(() => undefined);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Gagal mengunggah");
      setProgress(0);
    },
    onSettled: () => {
      setDragActive(false);
    }
  });

  const simulateProgress = () => {
    setProgress(5);
    const steps = [25, 55, 75];
    steps.forEach((step, index) => {
      setTimeout(() => setProgress(step), 200 * (index + 1));
    });
  };

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) {
        setError("Pilih file Excel terlebih dahulu.");
        return;
      }
      const file = files[0];
      if (!file.name.endsWith(".xlsx")) {
        setError("Format tidak didukung. Gunakan file .xlsx");
        return;
      }
      setError(null);
      simulateProgress();
      mutation.mutate(file);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [mutation]
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    handleFiles(event.dataTransfer?.files ?? null);
  };

  const handleBrowseClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="upload-form">
      <div
        className={`upload-dropzone ${dragActive ? "active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="Unggah file Excel dengan drag & drop"
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleBrowseClick();
          }
        }}
      >
        <p>
          Tarik & lepaskan file Excel (<code>.xlsx</code>)
        </p>
        <button type="button" className="link-button" onClick={handleBrowseClick} disabled={mutation.isLoading}>
          atau pilih dari komputer
        </button>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".xlsx"
          style={{ display: "none" }}
          onChange={(event) => handleFiles(event.target.files)}
        />
        {progress > 0 && (
          <div className="upload-progress" aria-label="Progres unggahan">
            <div className="upload-progress__bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {mutation.isLoading && <p aria-live="polite">Mengunggah...</p>}
      {error && (
        <p className="upload-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
