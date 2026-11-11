"use client";

import {
  Calendar,
  CheckCircle2,
  Clock,
  Pencil,
  Percent,
  Plus,
  Search,
  Tag,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { BranchNotice } from "@/components/layout/branch-notice";
import { OfferDialog } from "@/components/offers/offer-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import {
  useDeleteOffer,
  useOffers,
  useToggleOfferActive,
  type Offer,
} from "@/hooks/use-offers";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function getOfferStatus(offer: Offer): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
} {
  if (!offer.isActive) {
    return {
      label: "Inactive",
      variant: "outline",
      className: "border-border text-muted-foreground",
    };
  }

  const now = Date.now();
  const start = new Date(offer.startsAt).getTime();
  const end = new Date(offer.expiresAt).getTime();

  if (now < start) {
    return {
      label: "Scheduled",
      variant: "secondary",
      className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    };
  }

  if (now > end) {
    return {
      label: "Expired",
      variant: "outline",
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    };
  }

  return {
    label: "Active",
    variant: "default",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function OffersPage() {
  const { branchId, isLoading: branchLoading } = useBranch();
  const { data: me } = useCurrentUser();
  const canManage = hasPermission(me?.user, "offers.manage");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "SCHEDULED" | "EXPIRED" | "INACTIVE">("ALL");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);

  const { data: offers, isLoading, isError, error, refetch, isFetching } = useOffers(branchId);
  const toggleActive = useToggleOfferActive(branchId);
  const deleteOffer = useDeleteOffer(branchId);

  const allOffers = offers ?? [];

  // Summary counts
  const now = Date.now();
  const totalOffers = allOffers.length;
  const activeOffers = allOffers.filter(
    (o) => o.isActive && now >= new Date(o.startsAt).getTime() && now <= new Date(o.expiresAt).getTime(),
  ).length;
  const scheduledOffers = allOffers.filter((o) => o.isActive && now < new Date(o.startsAt).getTime()).length;
  const expiredOffers = allOffers.filter((o) => o.isActive && now > new Date(o.expiresAt).getTime()).length;
  const inactiveOffers = allOffers.filter((o) => !o.isActive).length;

  const filteredOffers = allOffers.filter((o) => {
    // Status filter
    if (filter === "ACTIVE") {
      if (!o.isActive || now < new Date(o.startsAt).getTime() || now > new Date(o.expiresAt).getTime())
        return false;
    } else if (filter === "SCHEDULED") {
      if (!o.isActive || now >= new Date(o.startsAt).getTime()) return false;
    } else if (filter === "EXPIRED") {
      if (!o.isActive || now <= new Date(o.expiresAt).getTime()) return false;
    } else if (filter === "INACTIVE") {
      if (o.isActive) return false;
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const nameMatch = o.name.toLowerCase().includes(q);
      const descMatch = o.description?.toLowerCase().includes(q);
      if (!nameMatch && !descMatch) return false;
    }

    return true;
  });

  const handleCreate = () => {
    setEditingOffer(null);
    setDialogOpen(true);
  };

  const handleEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setDialogOpen(true);
  };

  const handleDelete = (offer: Offer) => {
    if (!confirm(`Are you sure you want to delete or deactivate "${offer.name}"?`)) return;

    deleteOffer.mutate(offer.id, {
      onSuccess: (res) => {
        if (res.deactivated) {
          toast.info((res as any).message ?? "Offer deactivated to protect historical order records.");
        } else {
          toast.success(`Offer "${offer.name}" deleted.`);
        }
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Could not delete offer"),
    });
  };

  const handleToggle = (offer: Offer, checked: boolean) => {
    toggleActive.mutate(
      { id: offer.id, isActive: checked },
      {
        onSuccess: () => {
          toast.success(`Offer "${offer.name}" ${checked ? "activated" : "deactivated"}`);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not update status"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground">
            Promotional Offers & Discounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure percentage and flat promotional discounts, validity windows, and cashier discount rules.
          </p>
        </div>

        {canManage && (
          <Button onClick={handleCreate} className="h-9 gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            New Promotional Offer
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Card className="flex items-center gap-3 p-3.5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Tag className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold leading-none">{totalOffers}</div>
            <div className="mt-1 text-xs text-muted-foreground">Total Offers</div>
          </div>
        </Card>

        <Card
          className={cn(
            "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-emerald-500/50",
            filter === "ACTIVE" && "border-emerald-500 bg-emerald-500/5",
          )}
          onClick={() => setFilter((f) => (f === "ACTIVE" ? "ALL" : "ACTIVE"))}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold leading-none text-emerald-700 dark:text-emerald-300">
              {activeOffers}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Currently Active</div>
          </div>
        </Card>

        <Card
          className={cn(
            "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-blue-500/50",
            filter === "SCHEDULED" && "border-blue-500 bg-blue-500/5",
          )}
          onClick={() => setFilter((f) => (f === "SCHEDULED" ? "ALL" : "SCHEDULED"))}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold leading-none text-blue-700 dark:text-blue-300">
              {scheduledOffers}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Upcoming</div>
          </div>
        </Card>

        <Card
          className={cn(
            "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-amber-500/50",
            filter === "EXPIRED" && "border-amber-500 bg-amber-500/5",
          )}
          onClick={() => setFilter((f) => (f === "EXPIRED" ? "ALL" : "EXPIRED"))}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold leading-none text-amber-700 dark:text-amber-300">
              {expiredOffers}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Expired</div>
          </div>
        </Card>

        {inactiveOffers > 0 && (
          <Card
            className={cn(
              "flex cursor-pointer items-center gap-3 p-3.5 shadow-sm transition hover:border-muted-foreground/50",
              filter === "INACTIVE" && "border-foreground bg-muted/40",
            )}
            onClick={() => setFilter((f) => (f === "INACTIVE" ? "ALL" : "INACTIVE"))}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold leading-none text-muted-foreground">
                {inactiveOffers}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Inactive</div>
            </div>
          </Card>
        )}
      </div>

      {!branchId ? (
        <BranchNotice />
      ) : isLoading || branchLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <QueryError error={error} what="the promotional offers" onRetry={() => void refetch()} retrying={isFetching} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search offers by name or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Button
                variant={filter === "ALL" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setFilter("ALL")}
              >
                All ({allOffers.length})
              </Button>
              <Button
                variant={filter === "ACTIVE" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1 px-2.5 text-xs text-emerald-700 dark:text-emerald-300"
                onClick={() => setFilter("ACTIVE")}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Active ({activeOffers})
              </Button>
              <Button
                variant={filter === "SCHEDULED" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1 px-2.5 text-xs text-blue-700 dark:text-blue-300"
                onClick={() => setFilter("SCHEDULED")}
              >
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Upcoming ({scheduledOffers})
              </Button>
              <Button
                variant={filter === "EXPIRED" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1 px-2.5 text-xs text-amber-700 dark:text-amber-300"
                onClick={() => setFilter("EXPIRED")}
              >
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Expired ({expiredOffers})
              </Button>
            </div>
          </div>

          {/* Offers Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOffers.map((offer) => {
              const status = getOfferStatus(offer);
              const isPercentage = offer.type === "PERCENTAGE";

              return (
                <Card
                  key={offer.id}
                  className={cn(
                    "flex flex-col justify-between border-2 p-4 transition shadow-sm",
                    status.label === "Active" && "border-emerald-500/20 bg-emerald-500/[0.02]",
                    status.label === "Expired" && "border-amber-500/20 bg-amber-500/[0.01]",
                    status.label === "Inactive" && "border-dashed opacity-60 grayscale",
                  )}
                >
                  <div className="flex flex-col gap-3">
                    {/* Top Row: Name, Discount Value Badge, Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground text-base leading-tight">
                          {offer.name}
                        </h3>
                        {offer.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {offer.description}
                          </p>
                        )}
                      </div>

                      <Badge variant={status.variant} className={cn("gap-1.5 shrink-0", status.className)}>
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            status.label === "Active" && "bg-emerald-500",
                            status.label === "Scheduled" && "bg-blue-500",
                            status.label === "Expired" && "bg-amber-500",
                            status.label === "Inactive" && "bg-muted-foreground",
                          )}
                        />
                        {status.label}
                      </Badge>
                    </div>

                    {/* Value Badge Box */}
                    <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                        {isPercentage ? <Percent className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-foreground">
                          {isPercentage ? `${offer.value}% OFF` : `${formatCurrency(offer.value)} FLAT OFF`}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {Number(offer.minOrderAmount) > 0
                            ? `Min. order ${formatCurrency(offer.minOrderAmount)}`
                            : "No minimum spend"}
                          {isPercentage && offer.maxDiscount && ` · Cap: ${formatCurrency(offer.maxDiscount)}`}
                        </span>
                      </div>
                    </div>

                    {/* Validity Period */}
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>Valid: {formatDate(offer.startsAt)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 pl-5">
                        <span>Until: {formatDate(offer.expiresAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Switch */}
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={offer.isActive}
                        onCheckedChange={(checked) => handleToggle(offer, checked)}
                        disabled={!canManage || toggleActive.isPending}
                        id={`switch-${offer.id}`}
                      />
                      <label htmlFor={`switch-${offer.id}`} className="cursor-pointer text-xs font-medium">
                        {offer.isActive ? "Active" : "Disabled"}
                      </label>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleEdit(offer)}
                          title="Edit Offer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(offer)}
                          disabled={deleteOffer.isPending}
                          title="Delete or Deactivate Offer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}

            {filteredOffers.length === 0 && (
              <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
                <Tag className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="font-medium text-foreground">No promotional offers found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {canManage
                    ? "Click 'New Promotional Offer' above to configure discounts for your restaurant."
                    : "No offers are currently configured for this branch."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Offer Create / Edit Dialog */}
      <OfferDialog
        branchId={branchId}
        offer={editingOffer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
