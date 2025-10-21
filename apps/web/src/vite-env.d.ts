/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUBLIC_MODE?: string;
  readonly VITE_SCENARIO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
