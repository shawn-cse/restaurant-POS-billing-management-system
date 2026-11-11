"use client";

import type { TableStatusDto } from "@nodedr-restaurant/types";
import {
  BookmarkCheck,
  CheckCircle2,
  Clock,
  Layers,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BranchNotice } from "@/components/layout/branch-notice";
import { AddFloorDialog } from "@/components/tables/add-floor-dialog";
import { BillTableDialog } from "@/components/tables/bill-table-dialog";
import { EditableTableTile } from "@/components/tables/editable-table-tile";
import { ElapsedTimer } from "@/components/tables/elapsed-timer";
import { RenameFloorDialog } from "@/components/tables/rename-floor-dialog";
import { TableEditorDialog } from "@/components/tables/table-editor-dialog";
import { TableRequestsBar } from "@/components/tables/table-requests-bar";
import { TableShapeIcon } from "@/components/tables/table-shape-icon";
import { TableTile } from "@/components/tables/table-tile";
import { WaitlistPanel } from "@/components/tables/waitlist-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import {
  useFloors,
  useReleaseTable,
  useUpdateTableStatus,
  type RestaurantTable,
} from "@/hooks/use-tables";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const STATUS_BADGES: Record<
  TableStatusDto,
  { label: string; bg: string; text: string; dot: string }
> = {
  AVAILABLE: {
    label: "Available",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  OCCUPIED: {
    label: "Occupied",
    bg: "bg-amber-500/10 border-amber-500/30",
    text: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  RESERVED: {
    label: "Reserved",
    bg: "bg-purple-500/10 border-purple-500/30",
    text: "text-purple-800 dark:text-purple-300",
    dot: "bg-purple-500",
  },
  CLEANING: {
    label: "Cleaning",
    bg: "bg-muted border-border",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  OUT_OF_SERVICE: {
    label: "Out of service",
    bg: "bg-muted border-border",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export default function TablesPage() {
  const router = useRouter();
  const { branchId } = useBranch();
  const { data: me } = useCurrentUser();
  // tables.view allows viewing and releasing; tables.manage allows layout edits and table administration.
  const canManage = hasPermission(me?.user, "tables.manage");
  const floorsQuery = useFloors(branchId);
  const { data: floors } = floorsQuery;
  const { isLoading: branchLoading } = useBranch();
  const isLoading = floorsQuery.isLoading || branchLoading;

  const [activeFloorId, setActiveFloorId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"floor" | "grid">("floor");
  const [editModeRequested, setEditMode] = useState(false);
  const editMode = canManage && editModeRequested && viewMode === "floor";

  const [editorTable, setEditorTable] = useState<RestaurantTable | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // Billing dialog from grid view
  const [billingTable, setBillingTable] = useState<RestaurantTable | null>(null);
  const [billingOpen, setBillingOpen] = useState(false);

  // Search & Filter for Grid View
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const updateStatus = useUpdateTableStatus(branchId);
  const releaseTable = useReleaseTable(branchId);

  // On phones the floor plan is shrunk to fit the screen
  const cardRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setAvailableWidth(
        el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading, floors?.length]);

  const activeFloor = floors?.find((f) => f.id === (activeFloorId ?? floors[0]?.id));
  const allTables = floors?.flatMap((f) => f.tables) ?? [];

  // Summary counts
  const totalCount = allTables.length;
  const availableCount = allTables.filter((t) => t.status === "AVAILABLE" && t.isActive !== false).length;
  const occupiedCount = allTables.filter((t) => t.status === "OCCUPIED" && t.isActive !== false).length;
  const reservedCount = allTables.filter((t) => t.status === "RESERVED" && t.isActive !== false).length;
  const inactiveCount = allTables.filter((t) => t.isActive === false).length;

  const canvasWidth = activeFloor
    ? Math.max(600, ...activeFloor.tables.map((t) => t.posX + t.width + 40))
    : 600;
  const canvasHeight = activeFloor
    ? Math.max(320, ...activeFloor.tables.map((t) => t.posY + t.height + 40))
    : 320;

  const contentWidth = activeFloor
    ? Math.max(1, ...activeFloor.tables.map((t) => t.posX + t.width + 16))
    : canvasWidth;
  const fitScale =
    !editMode && availableWidth > 0 && availableWidth < contentWidth
      ? availableWidth / contentWidth
      : 1;

  const openAddTable = () => {
    setEditorTable(null);
    setEditorOpen(true);
    setEditorKey((k) => k + 1);
  };

  const openEditTable = (table: RestaurantTable) => {
    setEditorTable(table);
    setEditorOpen(true);
    setEditorKey((k) => k + 1);
  };

  // Filtered tables for Grid View
  const gridTables = (activeFloor?.tables ?? []).filter((table) => {
    if (statusFilter !== "ALL") {
      if (statusFilter === "INACTIVE") {
        if (table.isActive !== false) return false;
      } else if (table.status !== statusFilter) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const numMatch = table.number.toLowerCase().includes(q);
      const nameMatch = table.name?.toLowerCase().includes(q);
      const orderMatch = table.orders?.[0]?.orderNumber.toLowerCase().includes(q);
      if (!numMatch && !nameMatch && !orderMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <TableRequestsBar branchId={branchId} />

      {/* Header and Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground">
            Restaurant Tables
          </h1>
          <p className="text-sm text-muted-foreground">
            {editMode
              ? "Drag tables to reposition — layout coordinates save automatically"
              : "Live restaurant floor and table overview with real-time occupancy status"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1">
            <Button
              variant={viewMode === "floor" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => {
                setViewMode("floor");
              }}
            >
              <Layers className="h-3.5 w-3.5" />
              Floor Plan
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs"
              onClick={() => {
                setViewMode("grid");
                setEditMode(false);
              }}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid View
            </Button>
          </div>

          {canManage && floors && floors.length > 0 && viewMode === "floor" && (
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setEditMode((v) => !v)}
            >
              <LayoutGrid className="h-4 w-4" />
              {editMode ? "Done editing" : "Edit floor layout"}
            </Button>
          )}

          {canManage && (
            <Button size="sm" className="h-9 gap-1.5" onClick={openAddTable}>
              <Plus className="h-4 w-4" />
              Add table
            </Button>
          )}
        </div>
      </div>

      {/* Table Status Summary KPI Bar */}
      {floors && floors.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <Card className="flex items-center gap-3 p-3.5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold leading-none">{totalCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Total Tables</div>
            </div>
          </Card>

          <Card
            className={cn(
              "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-emerald-500/50",
              statusFilter === "AVAILABLE" && "border-emerald-500 bg-emerald-500/5",
            )}
            onClick={() => {
              setViewMode("grid");
              setStatusFilter((curr) => (curr === "AVAILABLE" ? "ALL" : "AVAILABLE"));
            }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold leading-none text-emerald-700 dark:text-emerald-300">
                {availableCount}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Available</div>
            </div>
          </Card>

          <Card
            className={cn(
              "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-amber-500/50",
              statusFilter === "OCCUPIED" && "border-amber-500 bg-amber-500/5",
            )}
            onClick={() => {
              setViewMode("grid");
              setStatusFilter((curr) => (curr === "OCCUPIED" ? "ALL" : "OCCUPIED"));
            }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold leading-none text-amber-700 dark:text-amber-300">
                {occupiedCount}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Occupied</div>
            </div>
          </Card>

          <Card
            className={cn(
              "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-purple-500/50",
              statusFilter === "RESERVED" && "border-purple-500 bg-purple-500/5",
            )}
            onClick={() => {
              setViewMode("grid");
              setStatusFilter((curr) => (curr === "RESERVED" ? "ALL" : "RESERVED"));
            }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300">
              <BookmarkCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold leading-none text-purple-700 dark:text-purple-300">
                {reservedCount}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Reserved</div>
            </div>
          </Card>

          {inactiveCount > 0 && (
            <Card
              className={cn(
                "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-muted-foreground/50",
                statusFilter === "INACTIVE" && "border-foreground bg-muted/40",
              )}
              onClick={() => {
                setViewMode("grid");
                setStatusFilter((curr) => (curr === "INACTIVE" ? "ALL" : "INACTIVE"));
              }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-bold leading-none text-muted-foreground">
                  {inactiveCount}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Inactive</div>
              </div>
            </Card>
          )}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : floorsQuery.isError && !floors ? (
        <QueryError
          error={floorsQuery.error}
          what="the tables"
          onRetry={() => void floorsQuery.refetch()}
          retrying={floorsQuery.isFetching}
        />
      ) : !branchId ? (
        <BranchNotice />
      ) : floors && floors.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            {/* Floor Navigation Tabs */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {(floors.length > 1 || editMode) && (
                <ResponsiveTabs
                  className="max-lg:w-full"
                  label="Floor"
                  value={activeFloorId ?? floors[0].id}
                  onChange={setActiveFloorId}
                  items={floors.map((f) => ({
                    id: f.id,
                    label: f.name,
                    hint: `${f.tables.filter((t) => t.status === "AVAILABLE" && t.isActive !== false).length} free`,
                  }))}
                />
              )}
              {editMode && (
                <>
                  <RenameFloorDialog
                    branchId={branchId}
                    floorId={activeFloor?.id ?? floors[0].id}
                    currentName={activeFloor?.name ?? floors[0].name}
                  />
                  <AddFloorDialog branchId={branchId} />
                  <Button variant="outline" size="sm" onClick={openAddTable}>
                    <Plus className="h-4 w-4" />
                    Add table
                  </Button>
                </>
              )}
            </div>

            {/* VIEW MODE 1: Floor Plan (Canvas) */}
            {viewMode === "floor" && (
              <Card ref={cardRef} className="overflow-auto p-3 sm:p-6 shadow-sm">
                <div
                  className="relative"
                  style={
                    fitScale < 1
                      ? {
                          width: availableWidth,
                          height: (canvasHeight - 40) * fitScale + 24,
                        }
                      : { width: canvasWidth, height: canvasHeight, minWidth: "100%" }
                  }
                >
                  <div
                    className="absolute left-0 top-0 origin-top-left"
                    style={{
                      width: canvasWidth,
                      height: canvasHeight,
                      transform: fitScale < 1 ? `scale(${fitScale})` : undefined,
                    }}
                  >
                    {activeFloor?.tables.map((table) =>
                      editMode ? (
                        <EditableTableTile
                          key={table.id}
                          table={table}
                          branchId={branchId}
                          onEdit={() => openEditTable(table)}
                        />
                      ) : (
                        <TableTile
                          key={table.id}
                          table={table}
                          allTables={allTables}
                          branchId={branchId}
                          style={{
                            left: table.posX,
                            top: table.posY,
                            width: table.width,
                            height: table.height,
                          }}
                        />
                      ),
                    )}
                    {activeFloor?.tables.length === 0 && (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No tables on this floor yet.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* VIEW MODE 2: Grid View (Card Dashboard) */}
            {viewMode === "grid" && (
              <div className="flex flex-col gap-4">
                {/* Search and Status Filters */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search tables or order #..."
                      className="h-9 pl-9 text-xs"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Button
                      variant={statusFilter === "ALL" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => setStatusFilter("ALL")}
                    >
                      All ({activeFloor?.tables.length ?? 0})
                    </Button>
                    <Button
                      variant={statusFilter === "AVAILABLE" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs text-emerald-700 dark:text-emerald-300"
                      onClick={() => setStatusFilter("AVAILABLE")}
                    >
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Available
                    </Button>
                    <Button
                      variant={statusFilter === "OCCUPIED" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs text-amber-700 dark:text-amber-300"
                      onClick={() => setStatusFilter("OCCUPIED")}
                    >
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Occupied
                    </Button>
                    <Button
                      variant={statusFilter === "RESERVED" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 gap-1.5 px-2.5 text-xs text-purple-700 dark:text-purple-300"
                      onClick={() => setStatusFilter("RESERVED")}
                    >
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      Reserved
                    </Button>
                  </div>
                </div>

                {/* Table Cards Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {gridTables.map((table) => {
                    const activeOrder = table.orders?.[0];
                    const badge = STATUS_BADGES[table.status] ?? STATUS_BADGES.AVAILABLE;
                    const isInactive = table.isActive === false;

                    return (
                      <Card
                        key={table.id}
                        className={cn(
                          "flex flex-col justify-between border-2 p-4 transition shadow-sm",
                          table.status === "AVAILABLE" && "border-emerald-500/20 bg-emerald-500/[0.02]",
                          table.status === "OCCUPIED" && "border-amber-500/30 bg-amber-500/[0.03]",
                          table.status === "RESERVED" && "border-purple-500/30 bg-purple-500/[0.03]",
                          isInactive && "border-dashed opacity-60 grayscale",
                        )}
                      >
                        <div>
                          {/* Card Top: Number, Seats, Status Badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <TableShapeIcon
                                shape={table.shape}
                                capacity={table.capacity}
                                className="h-6 w-6 text-foreground"
                              />
                              <div>
                                <h3 className="font-semibold text-foreground">
                                  {table.name ? table.name : `Table ${table.number}`}
                                </h3>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Users className="h-3.5 w-3.5" />
                                  <span>{table.capacity} Seating Capacity</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                              {isInactive ? (
                                <Badge variant="outline" className="border-border text-muted-foreground">
                                  Inactive
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className={cn("gap-1.5 font-medium", badge.bg, badge.text)}
                                >
                                  <span className={cn("h-2 w-2 rounded-full", badge.dot)} />
                                  {badge.label}
                                </Badge>
                              )}
                              {(table.status === "OCCUPIED" || table.status === "RESERVED") && (
                                <ElapsedTimer
                                  since={table.statusSince}
                                  className="text-[11px] text-muted-foreground"
                                />
                              )}
                            </div>
                          </div>

                          {/* Card Middle: Active Order Details (if occupied) */}
                          {table.status === "OCCUPIED" && activeOrder && (
                            <div className="mt-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs">
                              <div className="flex items-center justify-between font-medium">
                                <span className="text-amber-900 dark:text-amber-200">
                                  Order #{activeOrder.orderNumber}
                                </span>
                                <span className="font-bold text-amber-900 dark:text-amber-200">
                                  {formatCurrency(activeOrder.totalAmount)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-[11px] text-amber-800/80 dark:text-amber-300/80">
                                <span>{activeOrder.guestName ?? "Dine-in Guest"}</span>
                                <span>
                                  {activeOrder.guestCount ? `${activeOrder.guestCount} Guests` : "Dine-in"}
                                </span>
                              </div>
                            </div>
                          )}

                          {table.status === "RESERVED" && (
                            <div className="mt-3.5 rounded-xl border border-purple-500/20 bg-purple-500/10 p-2.5 text-xs text-purple-900 dark:text-purple-200">
                              <p className="font-medium">Table Reserved</p>
                              <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80">
                                Held for reservation. Release reservation to make available.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Card Bottom: Quick Actions */}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                          <div className="flex items-center gap-1.5">
                            {table.status === "AVAILABLE" && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => router.push(`/pos?tableId=${table.id}`)}
                                >
                                  Seat Dining Party
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() =>
                                    updateStatus.mutate(
                                      { id: table.id, status: "RESERVED" },
                                      {
                                        onSuccess: () => toast.success(`Table marked as Reserved`),
                                        onError: (err) =>
                                          toast.error(
                                            err instanceof ApiError ? err.message : "Could not reserve table",
                                          ),
                                      },
                                    )
                                  }
                                >
                                  Reserve
                                </Button>
                              </>
                            )}

                            {table.status === "RESERVED" && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => router.push(`/pos?tableId=${table.id}`)}
                                >
                                  Seat Guests
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() =>
                                    releaseTable.mutate(
                                      { id: table.id },
                                      {
                                        onSuccess: () =>
                                          toast.success(
                                            `${table.name ?? `Table ${table.number}`} reservation released`,
                                          ),
                                        onError: (err) =>
                                          toast.error(
                                            err instanceof ApiError
                                              ? err.message
                                              : "Could not release reservation",
                                          ),
                                      },
                                    )
                                  }
                                >
                                  Release Reservation
                                </Button>
                              </>
                            )}

                            {table.status === "OCCUPIED" && (
                              <>
                                {activeOrder && (
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => {
                                      setBillingTable(table);
                                      setBillingOpen(true);
                                    }}
                                  >
                                    Bill Table
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => router.push(`/pos?tableId=${table.id}`)}
                                >
                                  Add Items
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    if (activeOrder && !canManage) {
                                      toast.error(
                                        `Cannot release table with active bill #${activeOrder.orderNumber}. Settle or cancel bill first.`,
                                      );
                                      return;
                                    }
                                    if (activeOrder && canManage) {
                                      if (
                                        confirm(
                                          `Force-release ${table.name ?? `Table ${table.number}`}? Active order #${activeOrder.orderNumber} will be detached. This will be logged in the audit trail.`,
                                        )
                                      ) {
                                        releaseTable.mutate(
                                          {
                                            id: table.id,
                                            force: true,
                                            reason: "Manager override table release from dashboard",
                                          },
                                          {
                                            onSuccess: () =>
                                              toast.success(
                                                `${table.name ?? `Table ${table.number}`} released`,
                                              ),
                                          },
                                        );
                                      }
                                      return;
                                    }
                                    releaseTable.mutate(
                                      { id: table.id },
                                      {
                                        onSuccess: () =>
                                          toast.success(
                                            `${table.name ?? `Table ${table.number}`} released to Available`,
                                          ),
                                      },
                                    );
                                  }}
                                >
                                  Release
                                </Button>
                              </>
                            )}
                          </div>

                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Edit table configuration"
                              onClick={() => openEditTable(table)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}

                  {gridTables.length === 0 && (
                    <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                      No tables match the selected status or query.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status Color Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Legend color="bg-emerald-500" label="Available" />
              <Legend color="bg-amber-500" label="Occupied" />
              <Legend color="bg-purple-500" label="Reserved" />
              <Legend color="bg-muted-foreground" label="Cleaning / Out of service" />
            </div>
          </div>

          <WaitlistPanel branchId={branchId} availableTables={allTables.filter((t) => t.status === "AVAILABLE")} />
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-16 text-center">
          <p className="text-sm font-medium text-foreground">No floors yet</p>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Add your first floor to start building the restaurant table layout."
              : "Ask a manager to set up the floor plan."}
          </p>
          {canManage && <AddFloorDialog branchId={branchId} />}
        </Card>
      )}

      {/* Table Editor Dialog (Managers/Super Admins only) */}
      {activeFloor && (
        <TableEditorDialog
          key={editorKey}
          branchId={branchId}
          floorId={activeFloor.id}
          table={editorTable}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      )}

      {/* Bill Table Dialog for Grid View */}
      {billingTable && (
        <BillTableDialog
          branchId={branchId}
          table={billingTable}
          open={billingOpen}
          onOpenChange={setBillingOpen}
        />
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </div>
  );
}
