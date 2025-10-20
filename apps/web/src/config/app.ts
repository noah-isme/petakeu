const searchParams =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search) : undefined;

const envPublic = import.meta.env.VITE_PUBLIC_MODE === "true";
const queryPublic = searchParams?.get("public") === "1";

const envScenario = import.meta.env.VITE_SCENARIO as string | undefined;
const queryScenario = searchParams?.get("scenario") ?? undefined;

export const appConfig = {
  publicMode: envPublic || queryPublic,
  scenario: queryScenario ?? envScenario ?? "normal"
};
