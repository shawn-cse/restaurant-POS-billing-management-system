"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-auth";
export function AuthRedirectGate() {
  const { data, isSuccess } = useCurrentUser();
  const router = useRouter();
  useEffect(() => { if (isSuccess && data?.user) router.replace("/dashboard"); }, [data, isSuccess, router]);
  return null;
}
