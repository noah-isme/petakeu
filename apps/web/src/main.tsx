import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import "./styles/theme.css";
import "./styles/global.css";
import "leaflet/dist/leaflet.css";

const queryClient = new QueryClient();

async function enableMocking() {
  // Unregister existing service workers to avoid version conflicts
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      if (registration.active?.scriptURL.includes('mockServiceWorker')) {
        await registration.unregister();
      }
    }
  }

  const { worker } = await import("./mocks/browser");
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: {
      url: "/mockServiceWorker.js"
    }
  });
}

async function bootstrap() {
  await enableMocking();

  const rootElement = document.getElementById("root") as HTMLElement;

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

bootstrap();
