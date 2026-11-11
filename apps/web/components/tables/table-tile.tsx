"use client";

import type { TableStatusDto } from "@nodedr-restaurant/types";
import {
  AlertTriangle,
  BookmarkCheck,
  CheckCircle2,
  ClipboardList,
  Merge,
  Plus,
  QrCode,
  Sparkles,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import {
  useReleaseTable,
  useUpdateTableStatus,
  type RestaurantTable,
} from "@/hooks/use-tables";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { BillTableDialog } from "./bill-table-dialog";
import { ElapsedTimer } from "./elapsed-timer";
import { MergeTableDialog } from "./merge-table-dialog";
import { TableQrDialog } from "./table-qr-dialog";
import { TableShapeIcon } from "./table-shape-icon";

const STATUS_STYLES: Record<TableStatusDto, string> = {
  AVAILABLE:
    "bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20",
  OCCUPIED:
    "bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20",
  RESERVED:
    "bg-purple-500/10 border-purple-500/40 text-purple-800 dark:text-purple-300 hover:bg-purple-500/20",
  CLEANING: "bg-muted border-border text-muted-foreground",
  OUT_OF_SERVICE: "bg-muted border-border text-muted-foreground opacity-60",
};

const STATUS_LABEL: Record<TableStatusDto, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
  OUT_OF_SERVICE: "Out of service",
};

export function TableTile({
  table,
  allTables,
  branchId,
  style,
}: {
  table: RestaurantTable;
  allTables: RestaurantTable[];
  branchId: string | null;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const { data: me } = useCurrentUser();
  const canManage = hasPermission(me?.user, "tables.manage");
  const updateStatus = useUpdateTableStatus(branchId);
  const releaseTable = useReleaseTable(branchId);

  const [qrOpen, setQrOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [forceReleaseOpen, setForceReleaseOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const activeOrder = table.orders?.[0];
  const isInactive = table.isActive === false;

  const handleRelease = () => {
    if (activeOrder) {
      if (canManage) {
        setForceReleaseOpen(true);
        return;
      }
      toast.error(
        `Cannot release table with active bill #${activeOrder.orderNumber}. The bill must be paid or cancelled first.`,
      );
      return;
    }

    releaseTable.mutate(
      { id: table.id },
      {
        onSuccess: () => toast.success(`${table.name ?? `Table ${table.number}`} released to Available`),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not release table"),
      },
    );
  };

  const handleConfirmForceRelease = () => {
    releaseTable.mutate(
      {
        id: table.id,
        force: true,
        reason: overrideReason.trim() || "Manager authorized override table release",
      },
      {
        onSuccess: () => {
          toast.success(
            `${table.name ?? `Table ${table.number}`} force-released (order #${activeOrder?.orderNumber} detached)`,
          );
          setForceReleaseOpen(false);
          setOverrideReason("");
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not force-release table"),
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={style}
          className={cn(
            "absolute flex flex-col items-center justify-center gap-1 rounded-2xl border-2 p-1 text-xs font-medium shadow-sm transition-transform hover:scale-[1.03]",
            STATUS_STYLES[table.status],
            isInactive && "border-dashed opacity-50 grayscale",
          )}
        >
          <TableShapeIcon shape={table.shape} capacity={table.capacity} className="h-6 w-6" />
          <span className="text-sm font-semibold">{table.name ?? `T${table.number}`}</span>
          <span className="flex items-center gap-1 text-[11px] opacity-80">
            <Users className="h-3 w-3" />
            {table.capacity}
          </span>

          {isInactive && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              Inactive
            </span>
          )}

          {activeOrder && (
            <span className="max-w-[95%] truncate rounded bg-background/80 px-1 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">
              #{activeOrder.orderNumber} · {formatCurrency(activeOrder.totalAmount)}
            </span>
          )}

          {(table.status === "OCCUPIED" || table.status === "RESERVED") && (
            <ElapsedTimer since={table.statusSince} className="flex items-center gap-1 text-[10px] opacity-70" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {STATUS_LABEL[table.status]} · {table.capacity} guests
            {activeOrder && ` · Order #${activeOrder.orderNumber}`}
          </div>

          {/* Quick Primary Actions based on Table Status */}
          {table.status === "AVAILABLE" && (
            <>
              <DropdownMenuItem onClick={() => router.push(`/pos?tableId=${table.id}`)}>
                <Plus className="h-4 w-4" />
                Seat dining party (New order)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  updateStatus.mutate(
                    { id: table.id, status: "RESERVED" },
                    {
                      onSuccess: () => toast.success(`Table marked as Reserved`),
                      onError: (err) =>
                        toast.error(err instanceof ApiError ? err.message : "Could not reserve table"),
                    },
                  )
                }
              >
                <BookmarkCheck className="h-4 w-4" />
                Mark as Reserved
              </DropdownMenuItem>
            </>
          )}

          {table.status === "RESERVED" && (
            <>
              <DropdownMenuItem onClick={() => router.push(`/pos?tableId=${table.id}`)}>
                <Sparkles className="h-4 w-4" />
                Seat reservation (New order)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRelease}>
                <CheckCircle2 className="h-4 w-4" />
                Release reservation (Make Available)
              </DropdownMenuItem>
            </>
          )}

          {table.status === "OCCUPIED" && (
            <>
              <DropdownMenuItem onClick={() => router.push(`/pos?tableId=${table.id}`)}>
                <Plus className="h-4 w-4" />
                Add items / order
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBillOpen(true)}>
                <ClipboardList className="h-4 w-4" />
                Bill this table
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRelease}>
                <CheckCircle2 className="h-4 w-4" />
                {activeOrder && canManage ? "Force release table (Override)" : "Release table (Available)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMergeOpen(true)}>
                <Merge className="h-4 w-4" />
                Merge another table&apos;s bill
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {/* Status switches (Direct) */}
          <div className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
            Change Status
          </div>
          {(["AVAILABLE", "OCCUPIED", "RESERVED"] as TableStatusDto[]).map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={status === table.status}
              onClick={() => {
                if (status === "AVAILABLE") {
                  handleRelease();
                } else {
                  updateStatus.mutate(
                    { id: table.id, status },
                    {
                      onSuccess: () => toast.success(`Table marked as ${STATUS_LABEL[status]}`),
                      onError: (err) =>
                        toast.error(err instanceof ApiError ? err.message : "Could not update status"),
                    },
                  );
                }
              }}
            >
              {STATUS_LABEL[status]}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setQrOpen(true)}>
            <QrCode className="h-4 w-4" />
            View QR code
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Force Release Override Confirmation Modal for Managers/Super Admins */}
      <Dialog open={forceReleaseOpen} onOpenChange={setForceReleaseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Force Release Table</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              <strong>{table.name ?? `Table ${table.number}`}</strong> has an active order (
              <strong>#{activeOrder?.orderNumber}</strong> ·{" "}
              {formatCurrency(activeOrder?.totalAmount)}) that has not been settled.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2 text-sm text-muted-foreground">
            <p>
              As an authorized Manager / Super Admin, you can force-release this table to make it
              available for incoming guests. This action will disassociate the table from the open
              order and will be permanently recorded in the system audit log.
            </p>
            <div className="flex flex-col gap-1.5 pt-2">
              <Label htmlFor="override-reason" className="text-foreground">
                Reason for override (Optional)
              </Label>
              <Input
                id="override-reason"
                placeholder="e.g. Guests left / order moved to takeaway / settled offline"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setForceReleaseOpen(false)}
              disabled={releaseTable.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmForceRelease}
              disabled={releaseTable.isPending}
            >
              {releaseTable.isPending ? "Releasing…" : "Confirm Force Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TableQrDialog table={table} branchId={branchId} open={qrOpen} onOpenChange={setQrOpen} />
      <MergeTableDialog
        branchId={branchId}
        table={table}
        allTables={allTables}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />
      <BillTableDialog branchId={branchId} table={table} open={billOpen} onOpenChange={setBillOpen} />
    </>
  );
}
