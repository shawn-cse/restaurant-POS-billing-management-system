"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Public, unauthenticated — whether any restaurant has been registered on
// this self-hosted instance yet. Drives whether the Urban Bite landing screen
// offers first-time setup or directs staff to sign in.
export function useSetupStatus() {
  return useQuery({
    queryKey: ["auth", "setup-status"],
    queryFn: () => api.get<{ isSetup: boolean }>("/auth/setup-status"),
    staleTime: 60_000,
  });
}
