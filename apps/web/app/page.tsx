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
        <div className="mx-auto flex w-fit items-center justify-center rounded-3xl border border-border/80 bg-card p-3.5 shadow-sm">
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

          {/* Admin Credentials Quick-Fill Banner */}
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
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
              onClick={fillAdminCredentials}
              className="h-8 shrink-0 text-xs font-medium"
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
                className="h-10"
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
                className="h-10"
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
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="mt-1 h-11 text-sm font-medium"
              disabled={login.isPending}
            >
              {login.isPending ? "Signing in…" : "Sign in to Dashboard"}
            </Button>

            <p className="text-center text-[11px] text-muted-foreground">
              Other accounts can be created by the admin in <span className="font-medium text-foreground">Settings &gt; Staff</span>.
            </p>
          </form>
        </div>

        {/* Feature Badges */}
        <div className="mt-8 grid grid-cols-3 gap-2.5 text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/60 p-3">
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            <span>Point of sale</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/60 p-3">
            <ChefHat className="h-4 w-4 text-primary" />
            <span>Kitchen</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/60 p-3">
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
