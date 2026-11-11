"use client";

import type { KotStatusDto } from "@nodedr-restaurant/types";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ChefHat, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flushOutbox, outbox } from "@/lib/outbox";
import { isNativeApp } from "@/lib/native";
import { BranchNotice } from "@/components/layout/branch-notice";
import { PerformanceWidget } from "@/components/kds/performance-widget";
import { IncomingOrderCard } from "@/components/kds/incoming-order-card";
import { LiveStatus } from "@/components/kds/live-status";
import { TicketCard } from "@/components/kds/ticket-card";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import { useKdsSound } from "@/hooks/use-kds-sound";
import { useKdsIncoming, useKdsStations, useKdsTickets, useKdsTicketsWithPending, type KotTicket } from "@/hooks/use-kds";
import { useKdsStationPreference } from "@/hooks/use-kds-station";
import { installAudioUnlock } from "@/lib/audio-unlock";
import { resolveStation } from "@/lib/kds-station";
import { cn } from "@/lib/utils";

interface KitchenColumn {
  stage: "PENDING" | "PREPARING" | "READY";
  label: string;
  description: string;
  statuses: KotStatusDto[];
  dotClass: string;
  badgeClass: string;
}

const COLUMNS: KitchenColumn[] = [
  {
    stage: "PENDING",
    label: "Pending",
    description: "Orders awaiting prep",
    statuses: ["NEW", "ACCEPTED"],
    dotClass: "bg-amber-500",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  {
    stage: "PREPARING",
    label: "Preparing",
    description: "Currently cooking",
    statuses: ["PREPARING"],
    dotClass: "bg-blue-500",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  {
    stage: "READY",
    label: "Ready",
    description: "Awaiting waiter pickup",
    statuses: ["READY"],
    dotClass: "bg-emerald-500",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
];

export default function KdsPage() {
  const { branchId } = useBranch();
  const { data: me } = useCurrentUser();
  const canAnswer = hasPermission(me?.user, "orders.accept");
  const { data: stations, isError: stationsFailed } = useKdsStations(branchId);
  // The station is a per-device choice (each kitchen screen shows its own), so
  // it is remembered in this browser per branch - see lib/kds-station.ts.
  const pref = useKdsStationPreference(branchId);
  const { active: activeStation, stale, ready } = resolveStation(pref.saved, stations, stationsFailed);
  const canFetch = pref.ready && ready;
  const tickets = useKdsTickets(branchId, activeStation, canFetch);
  const incoming = useKdsIncoming(branchId, canAnswer);
  useKdsSound(branchId);
  useEffect(() => installAudioUnlock(), []);

  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const shown = useKdsTicketsWithPending(tickets.data);
  const waiting = useSyncExternalStore(outbox.subscribe, outbox.count, () => 0);
  const refused = useSyncExternalStore(outbox.subscribe, () => outbox.refused().join("\n"), () => "");
  // Fetching failed but an earlier copy is on screen: say how old it is.
  const showingSaved = tickets.isError && !!tickets.data;

  const sortedTickets = useMemo(() => {
    return [...shown].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
    });
  }, [shown, sortOrder]);

  const byStage = (statuses: KotStatusDto[]): KotTicket[] =>
    sortedTickets.filter((t) => statuses.includes(t.status));

  const totalActive = sortedTickets.filter((t) => t.status !== "SERVED").length;
  const pendingOrders = incoming.data ?? [];

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-4 lg:h-[calc(100dvh-8rem)]">
      {/* Header with Title, KPI count, and Sorting controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold sm:text-[32px] tracking-tight text-foreground flex items-center gap-2">
              <ChefHat className="h-7 w-7 text-primary" />
              Kitchen Display
            </h1>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary">
              {totalActive} Active {totalActive === 1 ? "Order" : "Orders"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Real-time order workflow: Pending → Preparing → Ready</p>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-1.5 self-start rounded-lg border border-border bg-card p-1 shadow-sm sm:self-auto">
          <span className="px-2 text-xs font-medium text-muted-foreground">Sort:</span>
          <Button
            type="button"
            size="sm"
            variant={sortOrder === "oldest" ? "default" : "ghost"}
            className="h-8 px-2.5 text-xs font-medium"
            onClick={() => setSortOrder("oldest")}
          >
            <ArrowUpWideNarrow className="mr-1.5 h-3.5 w-3.5" />
            Oldest First
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sortOrder === "newest" ? "default" : "ghost"}
            className="h-8 px-2.5 text-xs font-medium"
            onClick={() => setSortOrder("newest")}
          >
            <ArrowDownWideNarrow className="mr-1.5 h-3.5 w-3.5" />
            Newest First
          </Button>
        </div>
      </div>

      <LiveStatus />

      {stations && stations.length > 0 && (
        <div role="group" aria-label="Station" className="flex flex-wrap gap-2">
          {[{ id: "", name: "All stations" }, ...stations].map((s) => (
            <button
              key={s.id || "all"}
              type="button"
              aria-pressed={s.id === activeStation}
              onClick={() => pref.choose(s.id)}
              className={cn(
                "min-h-10 rounded-full border px-4 text-xs font-semibold transition-colors",
                s.id === activeStation
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {stale && (
        <p role="status" className="text-xs text-warning">
          The station saved on this screen no longer exists, so all stations are shown. Pick a station to pin it.
        </p>
      )}
      {pref.saveFailed && (
        <p role="alert" className="text-xs text-destructive">
          This browser blocked saving the choice, so it will reset when the page reloads.
        </p>
      )}

      <BranchNotice />

      {isNativeApp() && (showingSaved || waiting > 0) && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {showingSaved
              ? `No connection. Showing tickets from ${new Date(tickets.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. You can keep moving tickets along; printing and rejecting need the connection.`
              : "Sending saved changes…"}
            {waiting > 0 ? ` ${waiting} change${waiting === 1 ? "" : "s"} saved on this phone.` : ""}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => void flushOutbox().then(() => tickets.refetch())}
          >
            Send now
          </Button>
        </div>
      )}
      {refused && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="min-w-0 flex-1 whitespace-pre-line">
            The server did not accept {refused.split("\n").length === 1 ? "a saved change" : "some saved changes"}:{"\n"}
            {refused}
          </span>
          <Button type="button" variant="outline" className="h-9" onClick={() => outbox.clearRefused()}>
            Dismiss
          </Button>
        </div>
      )}

      {pendingOrders.length > 0 && (
        <section aria-label="Incoming orders" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Incoming - needs a decision{" "}
            <span className="ml-1 rounded-full bg-destructive px-2 py-0.5 text-xs text-white">{pendingOrders.length}</span>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {pendingOrders.map((order) => (
              <IncomingOrderCard key={order.id} order={order} branchId={branchId} />
            ))}
          </div>
        </section>
      )}
      {canAnswer && incoming.isError && (
        <p role="alert" className="text-xs text-destructive">
          Could not check for incoming orders. They will show here once the connection is back.
        </p>
      )}

      <PerformanceWidget branchId={branchId} />

      {tickets.isError && !tickets.data ? (
        <QueryError
          error={tickets.error}
          what="the kitchen tickets"
          onRetry={() => void tickets.refetch()}
          retrying={tickets.isFetching}
        />
      ) : (
        <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto sm:grid sm:snap-none sm:grid-cols-3 sm:gap-4 sm:overflow-hidden">
          {COLUMNS.map((col) => {
            const stageTickets = byStage(col.statuses);
            return (
              <div
                key={col.stage}
                className="flex w-[85%] shrink-0 snap-center flex-col gap-3 overflow-hidden rounded-2xl bg-secondary/30 border border-border/50 p-3 sm:w-auto sm:shrink"
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", col.dotClass)} />
                    <div>
                      <h2 className="text-sm font-bold text-foreground">{col.label}</h2>
                      <p className="text-[11px] text-muted-foreground">{col.description}</p>
                    </div>
                  </div>
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums", col.badgeClass)}>
                    {stageTickets.length}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-2 pr-1">
                  {(tickets.isLoading || !canFetch) &&
                    Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-40 rounded-2xl" />
                    ))}
                  {stageTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} branchId={branchId} />
                  ))}
                  {canFetch && !tickets.isLoading && stageTickets.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
                      <p className="font-medium">No {col.label.toLowerCase()} tickets</p>
                      <p className="mt-0.5 text-[11px]">New orders will appear automatically</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
