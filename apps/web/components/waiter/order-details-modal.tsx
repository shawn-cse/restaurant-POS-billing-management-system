"use client";

import { CheckCircle2, Clock, Flame, MapPin, Phone, User, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface WaiterOrderView {
  id: string;
  orderNumber: string;
  type: "DINE_IN" | "TAKEAWAY" | "DELIVERY";
  status: string;
  createdAt: string;
  deliveredAt?: string | null;
  guestName?: string | null;
  notes?: string | null;
  table?: { id: string; number: string; name?: string | null } | null;
  customer?: { name?: string | null; phone?: string | null } | null;
  items: {
    id: string;
    orderItem: {
      nameSnapshot: string;
      quantity: number;
      kitchenNote?: string | null;
      modifiers: { nameSnapshot: string }[];
    };
  }[];
}

interface OrderDetailsModalProps {
  order: WaiterOrderView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeliver?: (id: string) => void;
  isDelivering?: boolean;
}

export function OrderDetailsModal({
  order,
  open,
  onOpenChange,
  onDeliver,
  isDelivering,
}: OrderDetailsModalProps) {
  if (!order) return null;

  const isDineIn = order.type === "DINE_IN";
  const customerName = order.customer?.name || order.guestName || "Customer";
  const timeFormatted = new Date(order.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Utensils className="h-5 w-5 text-primary" />
              Order #{order.orderNumber}
            </DialogTitle>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                isDineIn ? "bg-secondary text-foreground" : "bg-primary/10 text-primary",
              )}
            >
              {isDineIn ? `Table ${order.table?.number ?? ""}` : "Takeaway"}
            </span>
          </div>
          <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
            <Clock className="h-3.5 w-3.5" />
            Created at {timeFormatted}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Customer & Location Info */}
          <div className="rounded-lg bg-secondary/40 p-3 text-xs space-y-1.5 border border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Customer:
              </span>
              <span className="font-semibold text-foreground">{customerName}</span>
            </div>
            {order.customer?.phone && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Phone:
                </span>
                <span className="font-mono text-foreground">{order.customer.phone}</span>
              </div>
            )}
            {isDineIn && order.table && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Seating:
                </span>
                <span className="font-semibold text-foreground">
                  Table {order.table.number} {order.table.name ? `(${order.table.name})` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Order Notes */}
          {order.notes && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <Flame className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <span>
                <strong>Special Note:</strong> {order.notes}
              </span>
            </div>
          )}

          {/* Items breakdown */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Items to Deliver
            </h4>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border/60 bg-card p-2.5 text-sm"
                >
                  <div className="flex items-baseline justify-between">
                    <p className="font-semibold text-foreground">
                      <span className="text-primary font-bold mr-1.5">
                        {item.orderItem.quantity}×
                      </span>
                      {item.orderItem.nameSnapshot}
                    </p>
                  </div>
                  {item.orderItem.modifiers.length > 0 && (
                    <p className="text-xs text-muted-foreground pl-5 mt-0.5">
                      + {item.orderItem.modifiers.map((m) => m.nameSnapshot).join(", ")}
                    </p>
                  )}
                  {item.orderItem.kitchenNote && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 pl-5 mt-1 flex items-center gap-1">
                      <Flame className="h-3 w-3" />
                      {item.orderItem.kitchenNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onDeliver && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              disabled={isDelivering}
              onClick={() => onDeliver(order.id)}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {isDelivering
                ? "Updating…"
                : isDineIn
                  ? "Mark Delivered to Table"
                  : "Mark Handed Over to Customer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
