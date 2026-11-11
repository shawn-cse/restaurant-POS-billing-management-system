"use client";

import { ApiError } from "@/lib/api";
import { CheckCircle2, Clock, CloudOff, Flame, Globe, Printer, Star, Timer, Utensils, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusNote, useNoteToast } from "@/components/ui/status-note";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactDetailsDialog } from "@/components/contact-details-dialog";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import {
  NEXT_STATUS,
  useRejectKot,
  useReprintKot,
  useSetKotPriority,
  useUpdateKotStatus,
  type KotTicket,
} from "@/hooks/use-kds";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Start Preparing",
  ACCEPTED: "Start Preparing",
  PREPARING: "Mark Ready",
  READY: "Mark Served",
};

const REJECT_REASONS = ["Out of stock", "Item unavailable", "Kitchen too busy", "Equipment problem"];

// A ticket this young is new enough to draw the eye (and it stops on its own).
const FRESH_MINUTES = 2;

function useElapsedMinutes(createdAt: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const compute = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)));
    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, [createdAt]);
  return elapsed;
}

function customerDisplayName(order: KotTicket["order"]) {
  return order.customer?.name || order.guestName || "Customer";
}

function customerPhone(order: KotTicket["order"]) {
  return order.customer?.phone || null;
}

function formatDiningType(order: KotTicket["order"]) {
  if (order.table) {
    return `Table ${order.table.number}`;
  }
  return order.type === "DINE_IN" ? "Dine-in" : "Takeaway";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "PREPARING":
      return {
        label: "Preparing",
        className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
      };
    case "READY":
      return {
        label: "Ready",
        className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      };
    case "NEW":
    case "ACCEPTED":
    default:
      return {
        label: "Pending",
        className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
  }
}

export function TicketCard({ ticket, branchId }: { ticket: KotTicket; branchId: string | null }) {
  const elapsed = useElapsedMinutes(ticket.createdAt);
  const updateStatus = useUpdateKotStatus(branchId);
  const setPriority = useSetKotPriority(branchId);
  const reprint = useReprintKot(branchId);
  const { note, clear: clearNote, toast } = useNoteToast();
  const nextStatus = NEXT_STATUS[ticket.status];
  const isLate = elapsed >= 15;
  const isFresh = ticket.status === "NEW" && elapsed < FRESH_MINUTES;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const reject = useRejectKot(branchId);
  const { data: me } = useCurrentUser();
  // Rejecting before cooking starts is for anyone on the kitchen screen; food
  // already on the stove is a manager's call (the server enforces the same).
  const started = ticket.status === "PREPARING";
  const canReject =
    (ticket.status === "NEW" || ticket.status === "ACCEPTED" || started) &&
    (!started || hasPermission(me?.user, "orders.cancel"));

  const hasSpecialNotes = Boolean(ticket.order.notes || ticket.items.some((i) => i.orderItem.kitchenNote));
  const statusBadge = getStatusBadge(ticket.status);
  const diningLabel = formatDiningType(ticket.order);
  const isTakeaway = !ticket.order.table;
  const timeFormatted = new Date(ticket.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <Card
      className={cn(
        "flex shrink-0 flex-col gap-3 p-4 transition-all duration-150",
        (isLate || ticket.isPriority) && "border-warning/50 ring-1 ring-warning/30",
        isFresh && "border-primary ring-2 ring-primary/40 motion-safe:animate-pulse",
        hasSpecialNotes && "border-l-4 border-l-amber-500",
      )}
    >
      <StatusNote note={note} onClear={clearNote} />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ticket for order #${ticket.order.orderNumber}?`}
        description={
          ticket.order.table
            ? `Table ${ticket.order.table.number} will be told the kitchen cannot make this. The ticket stays on record with your name and reason.`
            : "The guest will be told the kitchen cannot make this. The ticket stays on record with your name and reason."
        }
        warning={started ? "This ticket is already being prepared. Rejecting it means the food in progress is wasted." : undefined}
        reasons={REJECT_REASONS}
        confirmLabel="Reject ticket"
        keepLabel="Keep ticket"
        onSubmit={(reason) =>
          reject.mutateAsync({ id: ticket.id, reason, confirmStarted: started ? true : undefined })
        }
      />
      <ContactDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={`Order #${ticket.order.orderNumber}`}
        name={customerDisplayName(ticket.order)}
        subtitle={ticket.order.table ? `Table ${ticket.order.table.number}` : diningLabel}
        phone={customerPhone(ticket.order)}
        waMessage={`Hi ${customerDisplayName(ticket.order)}, this is regarding your order #${ticket.order.orderNumber}.`}
      />

      {/* Ticket Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2">
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="text-left hover:opacity-85"
          title="Click to view order details"
        >
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-base font-bold tracking-tight text-foreground">
              #{ticket.order.orderNumber}
            </span>
            {ticket.isPriority && <Star className="h-4 w-4 fill-warning text-warning" />}
            {ticket.order.channel === "ONLINE" && (
              <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-label="Online order" />
            )}
            <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-semibold", statusBadge.className)}>
              {statusBadge.label}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{customerDisplayName(ticket.order)}</span>
            <span>•</span>
            <span className={cn("font-medium", isTakeaway ? "text-primary" : "text-foreground")}>
              {diningLabel}
            </span>
            {ticket.station && (
              <>
                <span>•</span>
                <span>{ticket.station.name}</span>
              </>
            )}
          </div>
        </button>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              isLate ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground",
            )}
          >
            <Timer className="h-3 w-3" />
            {elapsed}m
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {timeFormatted}
          </span>
        </div>
      </div>

      {ticket.savedOnPhone && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <CloudOff className="h-3 w-3" aria-hidden /> Saved on this phone - will be sent when connection restores
        </p>
      )}

      {/* Special instructions alert if present */}
      {ticket.order.notes && (
        <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span><strong>Order Note:</strong> {ticket.order.notes}</span>
        </div>
      )}

      {/* Items List */}
      <div className="flex flex-col gap-2.5 py-1">
        {ticket.items.map((item) => (
          <div key={item.id} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold text-foreground">
                <span className="text-primary font-bold mr-1.5">{item.orderItem.quantity}×</span>
                {item.orderItem.nameSnapshot}
              </p>
            </div>
            {item.orderItem.modifiers.length > 0 && (
              <p className="pl-4 text-xs text-muted-foreground">
                + {item.orderItem.modifiers.map((m) => m.nameSnapshot).join(", ")}
              </p>
            )}
            {item.orderItem.kitchenNote && (
              <p className="mt-0.5 ml-4 flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 w-fit">
                <Flame className="h-3 w-3 text-amber-500 shrink-0" />
                <span>{item.orderItem.kitchenNote}</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Ready status notice for waiter pickup */}
      {ticket.status === "READY" && (
        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2.5 px-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Food Ready for Waiter Pickup</span>
        </div>
      )}

      {/* Workflow Controls */}
      <div className="mt-auto flex flex-col gap-2 pt-2 border-t border-border/60">
        {nextStatus && (
          <Button
            className={cn(
              "h-12 w-full text-base font-semibold shadow-sm",
              ticket.status === "PREPARING"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-primary hover:bg-primary/90 text-primary-foreground",
            )}
            disabled={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate(
                { id: ticket.id, status: nextStatus },
                {
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError
                        ? err.message
                        : "Could not update the ticket. Check the connection and try again.",
                    ),
                  onSuccess: (res) => {
                    if (res === null) toast.success("Saved on this phone - it will be sent when the connection is back");
                  },
                },
              )
            }
          >
            {updateStatus.isPending ? "Updating…" : STATUS_LABEL[ticket.status]}
          </Button>
        )}

        <div className="flex items-center gap-2">
          {canReject && (
            <Button
              variant="destructive"
              className="h-10 min-w-0 flex-1 px-3 text-xs font-medium"
              onClick={() => setRejectOpen(true)}
              aria-label={`Reject ticket for order ${ticket.order.orderNumber}`}
            >
              <X className="h-4 w-4 mr-1" aria-hidden />
              Reject
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            title={ticket.isPriority ? "Unmark priority" : "Mark priority"}
            aria-label={ticket.isPriority ? "Unmark priority" : "Mark priority"}
            disabled={setPriority.isPending}
            onClick={() =>
              setPriority.mutate({ id: ticket.id, isPriority: !ticket.isPriority })
            }
          >
            <Star className={cn("h-4 w-4", ticket.isPriority && "fill-warning text-warning")} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            title={ticket.printedCount > 0 ? "Reprint ticket (marked REPRINT)" : "Print ticket"}
            aria-label={ticket.printedCount > 0 ? "Reprint ticket" : "Print ticket"}
            disabled={reprint.isPending}
            onClick={() =>
              reprint.mutate(
                { id: ticket.id, reprint: ticket.printedCount > 0 },
                {
                  onSuccess: () =>
                    toast.success(
                      ticket.printedCount > 0 ? "Reprint sent to the kitchen printer" : "Ticket sent to the kitchen printer",
                    ),
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError ? err.message : "Could not reach the server - printing needs the connection",
                    ),
                },
              )
            }
          >
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
