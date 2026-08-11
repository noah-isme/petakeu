import * as React from "react";

export type UserRole = "public" | "viewer" | "operator" | "admin";

export interface AuthState {
  token: string | null;
  role: UserRole | null;
}

// The backend expects a Bearer JWT. The app currently has no login/session
// endpoint, so these keys are the small adapter boundary for an integrating
// shell to provide the token without coupling the UI to a storage vendor.
const ACCESS_TOKEN_KEYS = ["petakeu.access_token", "petakeu_access_token", "access_token"] as const;
const ROLES: readonly UserRole[] = ["public", "viewer", "operator", "admin"];

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    for (const key of ACCESS_TOKEN_KEYS) {
      const value = readStorage(storage, key);
      if (value) return value;
    }
  }

  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payloadPart = token.split(".")[1];
  if (!payloadPart) return null;

  try {
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
    return JSON.parse(window.atob(normalized)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getUserRole(token = getAccessToken()): UserRole | null {
  if (!token || typeof window === "undefined") return null;

  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  return typeof role === "string" && ROLES.includes(role as UserRole) ? (role as UserRole) : null;
}

export function readAuthState(): AuthState {
  const token = getAccessToken();
  return { token, role: getUserRole(token) };
}

export function isAdminUser(): boolean {
  return readAuthState().role === "admin";
}

export function useAdminAccess() {
  // Kept as a hook-shaped adapter so navigation re-evaluates when a host app
  // changes the token in another tab. The API remains the final RBAC gate.
  const [authState, setAuthState] = React.useState<AuthState>(() => readAuthState());

  React.useEffect(() => {
    const refresh = () => setAuthState(readAuthState());
    window.addEventListener("storage", refresh);
    window.addEventListener("petakeu-auth-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("petakeu-auth-changed", refresh);
    };
  }, []);

  return { ...authState, isAdmin: authState.role === "admin" };
}
