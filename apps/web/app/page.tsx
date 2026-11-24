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
  Loader2,
  ShieldCheck,
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
    setValue,
    formState: { errors },
  } = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const fillAdminCredentials = () => {
    setValue("email", "admin", { shouldValidate: true });
    setValue("password", "abc123", { shouldValidate: true });
    setError(null);
  };

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
        <div
          title="Urban Bite"
          className="mx-auto flex w-fit items-center justify-center rounded-3xl border border-border/80 bg-card p-3.5 shadow-sm transition-transform duration-200 hover:scale-105"
        >
          <Logo size={56} />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          Your restaurant. Your workspace.
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Urban Bite
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          Your home for orders, tables, kitchen tickets, inventory and daily operations.
        </p>

        {/* Embedded Sign In Card */}
        <div className="mt-7 rounded-2xl border border-border bg-card/95 p-6 text-left shadow-sm backdrop-blur-sm sm:p-7">
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-center">
            Sign in to manage your restaurant
          </h2>

          {/* Admin Credentials Box with Auto Fill */}
          <div
            title="Pre-configured administrator credentials for quick login"
            className="mt-4 flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/50 p-3 transition-colors hover:bg-muted/70 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <span>Admin Login:</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                User: <span className="font-mono font-medium text-foreground">admin</span> (or <span className="font-mono text-foreground">admin@gmail.com</span>)
              </p>
              <p className="text-muted-foreground">
                Pass: <span className="font-mono font-medium text-foreground">abc123</span>
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Click to automatically fill admin credentials"
              onClick={fillAdminCredentials}
              className="h-8 shrink-0 text-xs font-medium cursor-pointer transition-all hover:bg-background"
            >
              Auto Fill
            </Button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-xs font-medium">
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
                title="Enter your username or email address"
                className="h-10 transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="admin or admin@gmail.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-xs font-medium">
                Password
              </Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                enterKeyHint="go"
                title="Enter your password"
                className="h-10 transition-colors focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive transition-all"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              title="Click to sign in"
              className="mt-1 h-11 text-sm font-medium cursor-pointer shadow-sm transition-all duration-200 hover:opacity-95 active:scale-[0.99]"
              disabled={login.isPending}
            >
              {login.isPending ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in…</span>
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </div>

        {/* Feature Badges */}
        <div className="mt-8 grid grid-cols-3 gap-2.5 text-xs text-muted-foreground">
          <div
            title="Point of sale terminal for fast billing, takeaway, and dine-in orders"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/60 p-3 transition-all duration-150 hover:border-primary/50 hover:bg-card"
          >
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            <span>Point of sale</span>
          </div>
          <div
            title="Kitchen Display System for live orders and KOT ticket preparation"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/60 p-3 transition-all duration-150 hover:border-primary/50 hover:bg-card"
          >
            <ChefHat className="h-4 w-4 text-primary" />
            <span>Kitchen</span>
          </div>
          <div
            title="Operations management for tables, floor plans, inventory, and staff"
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/60 p-3 transition-all duration-150 hover:border-primary/50 hover:bg-card"
          >
            <ClipboardList className="h-4 w-4 text-primary" />
            <span>Operations</span>
          </div>
        </div>

        <p className="mt-7 text-xs text-muted-foreground">
          Private, self-hosted restaurant software
        </p>
      </div>
    </main>
  );
}
