"use client";

import Link from "next/link";
import { ArrowRight, ChefHat, ClipboardList, UtensilsCrossed } from "lucide-react";
import { AuthRedirectGate } from "@/components/marketing/auth-redirect-gate";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { useSetupStatus } from "@/hooks/use-setup-status";

export default function HomePage() {
  const { data, isLoading } = useSetupStatus();
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-5 py-16 text-center">
      <AuthRedirectGate />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary),transparent_88%),transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-xl">
        <div className="mx-auto flex w-fit items-center justify-center rounded-3xl border border-border/80 bg-card p-4 shadow-sm">
          <Logo size={68} />
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.25em] text-primary">Your restaurant. Your workspace.</p>
        <h1 className="mt-3 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">Urban Bite</h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-7 text-muted-foreground">
          Your home for orders, tables, kitchen tickets, inventory and daily operations.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {!isLoading && data?.isSetup ? (
            <Button size="lg" nativeButton={false} render={<Link href="/login" />}>Staff sign in <ArrowRight className="ml-2 h-4 w-4" /></Button>
          ) : !isLoading ? (
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>Set up Urban Bite <ArrowRight className="ml-2 h-4 w-4" /></Button>
          ) : (
            <span className="text-sm text-muted-foreground" role="status">Checking restaurant setup…</span>
          )}
          <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/login" />}>Already a staff member?</Button>
        </div>
        <div className="mt-14 grid grid-cols-3 gap-3 text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 p-4"><UtensilsCrossed className="h-5 w-5 text-primary" />Point of sale</div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 p-4"><ChefHat className="h-5 w-5 text-primary" />Kitchen</div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/60 p-4"><ClipboardList className="h-5 w-5 text-primary" />Operations</div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">Private, self-hosted restaurant software</p>
      </div>
    </main>
  );
}
