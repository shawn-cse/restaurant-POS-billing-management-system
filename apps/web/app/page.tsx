"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginDto } from "@urbanbite/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  AlertCircle,
  ChefHat,
  ClipboardList,
  UtensilsCrossed,
} from "lucide-react";
import { AuthRedirectGate } from "@/components/marketing/auth-redirect-gate";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const login = useLogin();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (dto: LoginDto) => {
    setError(null);
    login.mutate(dto, {
      onSuccess: (data) => {
        const user = (data as { user?: { roleName?: string; permissions?: string[] } }).user;
        const rider =
          user?.roleName === "DELIVERY_STAFF" &&
          user.permissions?.includes("delivery.rider");
        router.push(rider ? "/my-deliveries" : "/dashboard");
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status >= 500) {
          setError(
            "The server is having a problem right now. Please try again in a minute."
          );
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(
            "Can't reach the server. Check your connection and try again."
          );
        }
      },
    });
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 text-center">
      <AuthRedirectGate />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary),transparent_88%),transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-md">
        {/* Logo & Brand Header */}
        <div className="mx-auto flex w-fit items-center justify-center rounded-3xl border border-border/90 bg-card p-3.5 shadow-sm">
          <Logo size={60} />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.25em] text-primary">
          Your restaurant. Your workspace.
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Urban Bite
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-base font-medium leading-relaxed text-muted-foreground">
          Your home for orders, tables, kitchen tickets, inventory and daily operations.
        </p>

        {/* Embedded Sign In Card */}
        <div className="mt-8 rounded-2xl border border-border bg-card/95 p-6 text-left shadow-md backdrop-blur-sm sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground text-center">
            Sign in to manage your restaurant
          </h2>

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Username or email
              </Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                className="h-11 text-base font-medium text-foreground placeholder:text-muted-foreground/70"
                placeholder="Enter your username or email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs font-semibold text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                Password
              </Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                enterKeyHint="go"
                className="h-11 text-base font-medium text-foreground placeholder:text-muted-foreground/70"
                placeholder="Enter your password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs font-semibold text-destructive">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-2 h-12 text-base font-semibold shadow-sm"
              disabled={login.isPending}
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        {/* Feature Badges */}
        <div className="mt-8 grid grid-cols-3 gap-2.5 text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/80 p-3.5 font-semibold text-foreground shadow-xs">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold">Point of sale</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/80 p-3.5 font-semibold text-foreground shadow-xs">
            <ChefHat className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold">Kitchen</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/80 p-3.5 font-semibold text-foreground shadow-xs">
            <ClipboardList className="h-5 w-5 text-primary" />
            <span className="text-xs font-semibold">Operations</span>
          </div>
        </div>

        <p className="mt-7 text-xs font-medium text-muted-foreground">
          Private, self-hosted restaurant software
        </p>
      </div>
    </main>
  );
}
