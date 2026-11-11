"use client";

import { CheckCircle2, Clock, Eye, Flame, MapPin, PackageCheck, User, Utensils } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type ReadyFoodTicket } from "@/hooks/use-orders";
import { cn } from "@/lib/utils";
import { OrderDetailsModal, type WaiterOrderView } from "./order-details-modal";

interface ReadyFoodCardProps {
  ticket: ReadyFoodTicket;
  onDeliver: (ticketOrOrderId: string) => void;
  isPending: boolean;
}

export function ReadyFoodCard({ ticket, onDeliver, isPending }: ReadyFoodCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isDineIn = ticket.order.type === "DINE_IN";
  const customerName = ticket.order.customer?.name || ticket.order.guestName || "Customer";
  const isTakeaway = !ticket.order.table;
  const diningLabel = ticket.order.table ? `Table ${ticket.order.table.number}` : "Takeaway";
  const hasNotes = Boolean(ticket.order.notes || ticket.items.some((i) => i.orderItem.kitchenNote));

  // Time elapsed since ready
  const readyTime = ticket.readyAt ? new Date(ticket.readyAt) : new Date(ticket.createdAt);
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - readyTime.getTime()) / 60_000),
  );
  const isUrgent = elapsedMinutes >= 10;

  const orderView: WaiterOrderView = {
    id: ticket.id,
    orderNumber: ticket.order.orderNumber,
    type: ticket.order.type,
    status: ticket.status,
    createdAt: ticket.order.createdAt,
    guestName: ticket.order.guestName,
    notes: ticket.order.notes,
    table: ticket.order.table,
    customer: ticket.order.customer,
    items: ticket.items,
  };

  return (
    <>
      <OrderDetailsModal
        order={orderView}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onDeliver={onDeliver}
        isDelivering={isPending}
      />

      <Card
        className={cn(
          "flex flex-col justify-between overflow-hidden rounded-2xl border p-4 shadow-sm transition-all duration-150 hover:shadow-md",
          isUrgent && "border-warning/60 bg-warning/5 ring-1 ring-warning/30",
          hasNotes && "border-l-4 border-l-amber-500",
        )}
      >
        <div className="flex flex-col gap-3">
          {/* Card Top: Order Number, Ready Badge, and Timer */}
          <div className="flex items-start justify-between border-b border-border/60 pb-2.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold tracking-tight text-foreground">
                  #{ticket.order.orderNumber}
                </span>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Ready
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span className="font-semibold text-foreground">{customerName}</span>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                  isUrgent ? "bg-warning text-warning-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {elapsedMinutes}m ready
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                {readyTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>

          {/* Dining Location / Type indicator */}
          <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Order Type:</span>
            <div className="flex items-center gap-1.5 font-bold">
              {isDineIn ? (
                <>
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  <span className="text-foreground">{diningLabel}</span>
                </>
              ) : (
                <>
                  <PackageCheck className="h-4 w-4 text-primary" />
                  <span className="text-primary font-bold">Takeaway Pickup</span>
                </>
              )}
            </div>
          </div>

          {/* Special Notes banner if present */}
          {ticket.order.notes && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              <Flame className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
              <span>
                <strong>Note:</strong> {ticket.order.notes}
              </span>
            </div>
          )}

          {/* Items Summary */}
          <div className="space-y-1 py-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Items
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {ticket.items.map((item) => (
                <div key={item.id} className="text-xs">
                  <p className="font-medium text-foreground">
                    <span className="font-bold text-primary mr-1">
                      {item.orderItem.quantity}×
                    </span>
                    {item.orderItem.nameSnapshot}
                  </p>
                  {item.orderItem.modifiers.length > 0 && (
                    <p className="text-[11px] text-muted-foreground pl-4">
                      + {item.orderItem.modifiers.map((m) => m.nameSnapshot).join(", ")}
                    </p>
                  )}
                  {item.orderItem.kitchenNote && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-4 flex items-center gap-1">
                      <Flame className="h-3 w-3" />
                      {item.orderItem.kitchenNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-3">
          <Button
            className={cn(
              "h-11 w-full text-sm font-bold shadow-sm",
              isDineIn
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-primary hover:bg-primary/90 text-primary-foreground",
            )}
            disabled={isPending}
            onClick={() => onDeliver(ticket.id)}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {isPending
              ? "Updating…"
              : isDineIn
                ? `Mark Delivered (${diningLabel})`
                : "Mark Handed Over (Takeaway)"}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full text-xs"
            onClick={() => setDetailsOpen(true)}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            View Order Details
          </Button>
        </div>
      </Card>
    </>
  );
}
