"use client";

import { AlertTriangle, CheckCircle2, Lock, ShieldAlert, Sparkles } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { type RestaurantTable } from "@/hooks/use-tables";

interface TableReleaseModalProps {
  table: RestaurantTable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmRelease: (tableId: string, force?: boolean, reason?: string) => Promise<void>;
  isPending: boolean;
}

export function TableReleaseModal({
  table,
  open,
  onOpenChange,
  onConfirmRelease,
  isPending,
}: TableReleaseModalProps) {
  const { data: me } = useCurrentUser();
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!table) return null;

  const canForce =
    hasPermission(me?.user, "tables.manage") ||
    me?.user?.roleName === "SUPER_ADMIN" ||
    me?.user?.roleName === "MANAGER" ||
    me?.user?.roleName === "OWNER";

  const activeOrder = table.orders?.[0];
  const hasActiveUnpaidOrder = Boolean(activeOrder && (activeOrder.status === "OPEN" || activeOrder.status === "BILLED"));

  const handleRelease = async () => {
    setErrorMsg(null);
    try {
      await onConfirmRelease(table.id, force, force ? reason : undefined);
      onOpenChange(false);
      setForce(false);
      setReason("");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to release table. Please check active order status.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            Release Table {table.number}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Mark table as Available after dining party departs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Table summary */}
          <div className="rounded-lg bg-secondary/50 p-3 text-xs space-y-1 border border-border/60">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Table:</span>
              <span className="font-semibold text-foreground">
                Table {table.number} {table.name ? `(${table.name})` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Capacity:</span>
              <span className="font-semibold text-foreground">{table.capacity} Guests</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Status:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 capitalize">
                {table.status.toLowerCase()}
              </span>
            </div>
          </div>

          {/* Conflict warning if unbilled active order exists */}
          {hasActiveUnpaidOrder && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Active Unsettled Bill Detected
              </div>
              <p>
                This table is associated with active order{" "}
                <strong>#{activeOrder?.orderNumber}</strong>. Please ensure the bill has been settled
                at the Cashier before releasing the table.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive">
              {errorMsg}
            </div>
          )}

          {/* Manager Force Override Section */}
          {hasActiveUnpaidOrder && canForce && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="force-check" className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 cursor-pointer">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  Manager Authorized Override
                </Label>
                <input
                  id="force-check"
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>

              {force && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="override-reason" className="text-[11px] text-muted-foreground">
                    Reason for Force Release (required for audit log):
                  </Label>
                  <Input
                    id="override-reason"
                    placeholder="e.g. Guest moved tables / bill settled manually"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>
          )}

          {!hasActiveUnpaidOrder && (
            <p className="text-xs text-muted-foreground">
              Customer has departed and all active orders are settled. Releasing will set this table
              to <strong>Available</strong> for new dining parties.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            disabled={isPending || (hasActiveUnpaidOrder && !force) || (force && !reason.trim())}
            onClick={handleRelease}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {isPending
              ? "Releasing…"
              : force
                ? "Force Release Table"
                : "Mark Table Available"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
