import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createConflictMutationCache } from "./app/conflict-fallback";
import { router } from "./app/router";
import "./styles/global.css";

const queryClient: QueryClient = new QueryClient({ mutationCache: createConflictMutationCache(() => queryClient) });
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
