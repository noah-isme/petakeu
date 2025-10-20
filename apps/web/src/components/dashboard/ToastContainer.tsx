import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const TOAST_CONFIG: Record<ToastKind, { icon: typeof AlertCircle; background: string; border: string; text: string }> = {
  success: {
    icon: CheckCircle2,
    background: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-emerald-200"
  },
  error: {
    icon: AlertCircle,
    background: "bg-rose-500/15",
    border: "border-rose-500/30",
    text: "text-rose-200"
  },
  info: {
    icon: Info,
    background: "bg-blue-500/15",
    border: "border-blue-500/30",
    text: "text-blue-200"
  }
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[1200] flex items-start justify-end px-6">
      <div className="flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const config = TOAST_CONFIG[toast.kind];
          const Icon = config.icon;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border ${config.background} ${config.border} ${config.text} p-4 shadow-2xl backdrop-blur`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="flex-1 text-sm leading-5">{toast.message}</div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-full p-1 text-slate-200/80 transition hover:bg-slate-200/10 hover:text-white"
              >
                <span className="sr-only">Tutup notifikasi</span>
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
