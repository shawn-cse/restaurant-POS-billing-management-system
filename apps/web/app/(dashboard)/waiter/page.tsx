"use client";

import {
  BellRing,
  CheckCircle2,
  Clock,
  LayoutGrid,
  MapPin,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Timer,
  User,
  Utensils,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BranchNotice } from "@/components/layout/branch-notice";
import { ReadyFoodCard } from "@/components/waiter/ready-food-card";
import { TableReleaseModal } from "@/components/waiter/table-release-modal";
import { useBranch } from "@/hooks/use-branch";
import {
  useDeliverFood,
  useDeliveredOrders,
  useHandoverFood,
  useReadyFood,
  type ReadyFoodTicket,
} from "@/hooks/use-orders";
import {
  useFloors,
  useReleaseTable,
  type RestaurantTable,
} from "@/hooks/use-tables";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function WaiterDashboardPage() {
  const { branchId } = useBranch();
  const [activeTab, setActiveTab] = useState<string>("ready-food");
  const [tableFilter, setTableFilter] = useState<"ALL" | "AVAILABLE" | "OCCUPIED" | "RESERVED">("ALL");
  const [selectedTableForRelease, setSelectedTableForRelease] = useState<RestaurantTable | null>(null);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);

  // Ready food query & delivery mutations
  const readyFoodQuery = useReadyFood(branchId);
  const deliverMutation = useDeliverFood(branchId);
  const handoverMutation = useHandoverFood(branchId);
  const deliveredQuery = useDeliveredOrders(branchId);

  // Table overview & release
  const floorsQuery = useFloors(branchId);
  const releaseTableMutation = useReleaseTable(branchId);

  // Active in-progress orders
  const activeOrdersQuery = useQuery({
    queryKey: ["orders", "waiter-active", branchId],
    queryFn: () =>
      api.get<any[]>(`/orders/manage?branchId=${branchId}&tab=active`),
    enabled: !!branchId,
    refetchInterval: 15_000,
  });

  const readyTickets = readyFoodQuery.data ?? [];
  const readyDineInCount = readyTickets.filter((t) => t.order.type === "DINE_IN").length;
  const readyTakeawayCount = readyTickets.filter((t) => t.order.type !== "DINE_IN").length;

  // Flatten tables from all floors
  const allTables = useMemo(() => {
    return (floorsQuery.data ?? []).flatMap((floor) =>
      floor.tables.map((t) => ({ ...t, floorName: floor.name })),
    );
  }, [floorsQuery.data]);

  const availableTablesCount = allTables.filter((t) => t.status === "AVAILABLE").length;
  const occupiedTablesCount = allTables.filter((t) => t.status === "OCCUPIED").length;

  const filteredTables = useMemo(() => {
    if (tableFilter === "ALL") return allTables;
    return allTables.filter((t) => t.status === tableFilter);
  }, [allTables, tableFilter]);

  // Handle food delivery
  const handleDeliver = (ticketId: string) => {
    deliverMutation.mutate(ticketId);
  };

  // Handle takeaway handover
  const handleHandover = (ticketId: string) => {
    handoverMutation.mutate(ticketId);
  };

  // Handle table release confirmation
  const handleConfirmRelease = async (
    tableId: string,
    force?: boolean,
    reason?: string,
  ) => {
    await releaseTableMutation.mutateAsync({ id: tableId, force, reason });
  };

  return (
    <div className="flex flex-col gap-5 pb-10">
      <BranchNotice />

      {/* Header and Quick Operational KPIs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[32px] flex items-center gap-2">
              <BellRing className="h-7 w-7 text-primary" />
              Waiter Station
            </h1>
            {readyTickets.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 motion-safe:animate-pulse">
                {readyTickets.length} Ready for Pickup
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Live ready-food dispatch, table service, food delivery, and table release
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/pos"
            className="inline-flex items-center justify-center rounded-md h-10 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <Utensils className="mr-1.5 h-4 w-4" />
            New Order (POS)
          </Link>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            title="Refresh dashboard"
            onClick={() => {
              readyFoodQuery.refetch();
              floorsQuery.refetch();
              activeOrdersQuery.refetch();
              deliveredQuery.refetch();
            }}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                readyFoodQuery.isFetching && "animate-spin text-primary",
              )}
            />
          </Button>
        </div>
      </div>

      {/* Operational KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          className={cn(
            "p-3.5 transition-all cursor-pointer",
            activeTab === "ready-food" ? "border-primary bg-primary/5" : "bg-card",
          )}
          onClick={() => setActiveTab("ready-food")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Ready Food</span>
            <UtensilsCrossed className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {readyTickets.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {readyDineInCount} Dine-in · {readyTakeawayCount} Takeaway
          </p>
        </Card>

        <Card
          className={cn(
            "p-3.5 transition-all cursor-pointer",
            activeTab === "tables" ? "border-primary bg-primary/5" : "bg-card",
          )}
          onClick={() => setActiveTab("tables")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Tables</span>
            <LayoutGrid className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {occupiedTablesCount}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              / {allTables.length} occupied
            </span>
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
            {availableTablesCount} available for seating
          </p>
        </Card>

        <Card
          className={cn(
            "p-3.5 transition-all cursor-pointer",
            activeTab === "active-orders" ? "border-primary bg-primary/5" : "bg-card",
          )}
          onClick={() => setActiveTab("active-orders")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Kitchen Active</span>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {(activeOrdersQuery.data ?? []).length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">In prep / cooking</p>
        </Card>

        <Card
          className={cn(
            "p-3.5 transition-all cursor-pointer",
            activeTab === "delivered" ? "border-primary bg-primary/5" : "bg-card",
          )}
          onClick={() => setActiveTab("delivered")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Delivered Today</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {(deliveredQuery.data ?? []).length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Completed runs</p>
        </Card>
      </div>

      {/* Main Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 bg-secondary/40 border border-border/60 rounded-xl">
          <TabsTrigger value="ready-food" className="py-2 text-xs font-semibold relative">
            Ready Food
            {readyTickets.length > 0 && (
              <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {readyTickets.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tables" className="py-2 text-xs font-semibold">
            Available Tables
          </TabsTrigger>
          <TabsTrigger value="active-orders" className="py-2 text-xs font-semibold">
            Active Orders
          </TabsTrigger>
          <TabsTrigger value="takeaway" className="py-2 text-xs font-semibold">
            Takeaway Handover
            {readyTakeawayCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-bold text-primary-foreground">
                {readyTakeawayCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="delivered" className="py-2 text-xs font-semibold">
            Delivered Orders
          </TabsTrigger>
        </TabsList>

        {/* ---------------- SECTION 1: READY FOOD ---------------- */}
        <TabsContent value="ready-food" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Ready Food for Dispatch</h2>
              <p className="text-xs text-muted-foreground">
                Dishes prepared by the kitchen awaiting delivery to tables or takeaway handover
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              Auto-updates live via WebSocket
            </span>
          </div>

          {readyFoodQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-2xl" />
              ))}
            </div>
          ) : readyTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <h3 className="text-base font-bold text-foreground">All Ready Orders Delivered</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                When kitchen staff marks dishes ready on the Kitchen Display System (KDS), they will
                appear here instantly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {readyTickets.map((ticket) => (
                <ReadyFoodCard
                  key={ticket.id}
                  ticket={ticket}
                  onDeliver={ticket.order.type === "DINE_IN" ? handleDeliver : handleHandover}
                  isPending={deliverMutation.isPending || handoverMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- SECTION 2: AVAILABLE TABLES & RELEASE ---------------- */}
        <TabsContent value="tables" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Table Management & Seating</h2>
              <p className="text-xs text-muted-foreground">
                View table occupancy, seat parties, and release tables after guests leave
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-card p-1">
              {(["ALL", "AVAILABLE", "OCCUPIED", "RESERVED"] as const).map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={tableFilter === filter ? "default" : "ghost"}
                  className="h-7 px-2.5 text-xs font-semibold capitalize"
                  onClick={() => setTableFilter(filter)}
                >
                  {filter === "ALL" ? "All Tables" : filter.toLowerCase()}
                </Button>
              ))}
            </div>
          </div>

          {floorsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : filteredTables.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No tables matching filter
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {filteredTables.map((table) => {
                const isOccupied = table.status === "OCCUPIED";
                const isAvailable = table.status === "AVAILABLE";
                const isReserved = table.status === "RESERVED";
                const activeOrder = table.orders?.[0];

                return (
                  <Card
                    key={table.id}
                    className={cn(
                      "flex flex-col justify-between rounded-xl border p-3.5 shadow-sm transition-all",
                      isAvailable && "border-emerald-500/30 bg-emerald-500/5",
                      isOccupied && "border-amber-500/40 bg-amber-500/5",
                      isReserved && "border-blue-500/40 bg-blue-500/5",
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <span className="font-mono text-base font-bold text-foreground">
                          Table {table.number}
                        </span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            isAvailable && "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                            isOccupied && "bg-amber-500/20 text-amber-600 dark:text-amber-400",
                            isReserved && "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                          )}
                        >
                          {table.status}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Capacity: {table.capacity} guests
                      </p>

                      {activeOrder && (
                        <div className="mt-2 rounded bg-background/80 p-1.5 text-[11px] border border-border/50">
                          <p className="font-bold text-foreground truncate">
                            #{activeOrder.orderNumber}
                          </p>
                          <p className="text-muted-foreground truncate">
                            {activeOrder.guestName || "Customer"}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-border/50 flex flex-col gap-1.5">
                      {isOccupied && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-full text-xs font-semibold border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          onClick={() => {
                            setSelectedTableForRelease(table);
                            setReleaseModalOpen(true);
                          }}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Mark Available
                        </Button>
                      )}

                      {isAvailable && (
                        <Link
                          href={`/pos?tableId=${table.id}`}
                          className="inline-flex items-center justify-center rounded-md h-8 w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <Utensils className="h-3 w-3 mr-1" />
                          Seat / Order
                        </Link>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ---------------- SECTION 3: ACTIVE ORDERS ---------------- */}
        <TabsContent value="active-orders" className="mt-4 space-y-4">
          <div>
            <h2 className="text-base font-bold text-foreground">In-Progress Kitchen Orders</h2>
            <p className="text-xs text-muted-foreground">
              Orders confirmed and cooking in the kitchen (Pending / Preparing)
            </p>
          </div>

          {activeOrdersQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (activeOrdersQuery.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No active in-progress orders
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(activeOrdersQuery.data ?? []).map((order: any) => {
                const isDineIn = order.type === "DINE_IN";
                const customerName = order.customer?.name || order.guestName || "Customer";
                const orderTime = new Date(order.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <Card key={order.id} className="p-4 rounded-xl border border-border/70 space-y-2">
                    <div className="flex items-start justify-between border-b border-border/50 pb-2">
                      <div>
                        <span className="font-mono text-base font-bold text-foreground">
                          #{order.orderNumber}
                        </span>
                        <p className="text-xs text-muted-foreground">{customerName}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {isDineIn ? `Table ${order.table?.number ?? ""}` : "Takeaway"}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>Created at {orderTime}</span>
                      <span className="font-medium text-foreground">
                        {order.items?.length ?? 0} Items
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 text-xs pt-1">
                      {(order.items ?? []).slice(0, 3).map((item: any) => (
                        <p key={item.id} className="truncate">
                          <span className="font-bold text-primary mr-1">{item.quantity}×</span>
                          {item.nameSnapshot}
                        </p>
                      ))}
                      {(order.items?.length ?? 0) > 3 && (
                        <p className="text-[11px] text-muted-foreground">
                          + {order.items.length - 3} more items
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ---------------- SECTION 4: TAKEAWAY HANDOVER ---------------- */}
        <TabsContent value="takeaway" className="mt-4 space-y-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Takeaway Handover Counter</h2>
            <p className="text-xs text-muted-foreground">
              Ready takeaway orders waiting for packaging and handover to the guest
            </p>
          </div>

          {readyTickets.filter((t) => t.order.type !== "DINE_IN").length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center">
              <PackageCheck className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <h3 className="text-sm font-bold text-foreground">No Takeaway Orders Ready</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Takeaway orders will appear here automatically when food is marked ready by the kitchen.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {readyTickets
                .filter((t) => t.order.type !== "DINE_IN")
                .map((ticket) => (
                  <ReadyFoodCard
                    key={ticket.id}
                    ticket={ticket}
                    onDeliver={handleHandover}
                    isPending={handoverMutation.isPending}
                  />
                ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- SECTION 5: DELIVERED ORDERS ---------------- */}
        <TabsContent value="delivered" className="mt-4 space-y-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Delivered Order Runs (Today)</h2>
            <p className="text-xs text-muted-foreground">
              Food orders successfully delivered to dining tables or handed over to takeaway customers
            </p>
          </div>

          {deliveredQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (deliveredQuery.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No orders delivered yet today
            </p>
          ) : (
            <div className="space-y-2.5">
              {(deliveredQuery.data ?? []).map((order: any) => {
                const isDineIn = order.type === "DINE_IN";
                const customerName = order.customer?.name || order.guestName || "Customer";
                const deliveredTime = order.deliveredAt
                  ? new Date(order.deliveredAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Delivered";

                return (
                  <Card
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-border/70 gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-foreground">
                            #{order.orderNumber}
                          </span>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold">
                            {isDineIn ? `Table ${order.table?.number ?? ""}` : "Takeaway"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {customerName} · {order.items?.length ?? 0} items
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right text-xs">
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 sm:justify-end">
                        <Clock className="h-3 w-3" />
                        Delivered at {deliveredTime}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Table Release Modal */}
      <TableReleaseModal
        table={selectedTableForRelease}
        open={releaseModalOpen}
        onOpenChange={setReleaseModalOpen}
        onConfirmRelease={handleConfirmRelease}
        isPending={releaseTableMutation.isPending}
      />
    </div>
  );
}
