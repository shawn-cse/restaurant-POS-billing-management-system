"use client";

import type { OfferTypeDto } from "@nodedr-restaurant/types";
import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateOffer,
  useUpdateOffer,
  type Offer,
} from "@/hooks/use-offers";
import { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

function toDateTimeLocal(isoString?: string | null): string {
  if (!isoString) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  const d = new Date(isoString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function getDefaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function OfferDialog({
  branchId,
  offer,
  open,
  onOpenChange,
}: {
  branchId: string | null;
  offer?: Offer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!offer;
  const createOffer = useCreateOffer(branchId);
  const updateOffer = useUpdateOffer(branchId);
  const isPending = createOffer.isPending || updateOffer.isPending;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<OfferTypeDto>("PERCENTAGE");
  const [value, setValue] = useState("10");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [startsAt, setStartsAt] = useState(toDateTimeLocal());
  const [expiresAt, setExpiresAt] = useState(getDefaultExpiry());
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (offer) {
      setName(offer.name);
      setDescription(offer.description ?? "");
      setType(offer.type);
      setValue(String(offer.value));
      setMinOrderAmount(String(offer.minOrderAmount ?? 0));
      setMaxDiscount(offer.maxDiscount ? String(offer.maxDiscount) : "");
      setStartsAt(toDateTimeLocal(offer.startsAt));
      setExpiresAt(toDateTimeLocal(offer.expiresAt));
      setIsActive(offer.isActive);
    } else {
      setName("");
      setDescription("");
      setType("PERCENTAGE");
      setValue("10");
      setMinOrderAmount("0");
      setMaxDiscount("");
      setStartsAt(toDateTimeLocal());
      setExpiresAt(getDefaultExpiry());
      setIsActive(true);
    }
  }, [offer, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue <= 0) {
      toast.error("Discount value must be greater than zero");
      return;
    }

    if (type === "PERCENTAGE" && numValue > 100) {
      toast.error("Percentage discount cannot exceed 100%");
      return;
    }

    const startDate = new Date(startsAt);
    const expiryDate = new Date(expiresAt);

    if (expiryDate.getTime() <= startDate.getTime()) {
      toast.error("Expiration date & time must be after the start date & time");
      return;
    }

    const dto = {
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      value: numValue,
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscount: maxDiscount.trim() ? Number(maxDiscount) : null,
      startsAt: startDate.toISOString(),
      expiresAt: expiryDate.toISOString(),
      isActive,
    };

    if (isEdit && offer) {
      updateOffer.mutate(
        { id: offer.id, dto },
        {
          onSuccess: () => {
            toast.success(`Offer "${dto.name}" updated successfully`);
            onOpenChange(false);
          },
          onError: (err) =>
            toast.error(err instanceof ApiError ? err.message : "Could not update offer"),
        },
      );
    } else {
      createOffer.mutate(dto, {
        onSuccess: () => {
          toast.success(`Offer "${dto.name}" created successfully`);
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not create offer"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Promotional Offer" : "New Promotional Offer"}</DialogTitle>
            <DialogDescription>
              Configure promotional discounts, validity windows, and order thresholds for UrbanBite.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Offer Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-name">Offer Name *</Label>
              <Input
                id="offer-name"
                placeholder="e.g. Grand Opening 15% Off or Weekend Special"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="offer-description">Description (Optional)</Label>
              <Textarea
                id="offer-description"
                placeholder="Short customer-facing or internal note about this offer..."
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Type & Value */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-type">Discount Type</Label>
                <Select value={type} onValueChange={(val) => setType(val as OfferTypeDto)}>
                  <SelectTrigger id="offer-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                    <SelectItem value="FIXED">Fixed Amount (TK.)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-value">
                  Discount Value {type === "PERCENTAGE" ? "(%)" : "(TK.)"} *
                </Label>
                <div className="relative">
                  <Input
                    id="offer-value"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={type === "PERCENTAGE" ? "100" : undefined}
                    placeholder={type === "PERCENTAGE" ? "15" : "150.00"}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                    {type === "PERCENTAGE" ? "%" : "TK."}
                  </span>
                </div>
              </div>
            </div>

            {/* Min Order & Max Cap */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-min-order">Min Order Amount (TK.)</Label>
                <Input
                  id="offer-min-order"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={minOrderAmount}
                  onChange={(e) => setMinOrderAmount(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-max-discount">
                  Max Cap (TK.) {type === "FIXED" && "(N/A)"}
                </Label>
                <Input
                  id="offer-max-discount"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={type === "FIXED"}
                  placeholder={type === "PERCENTAGE" ? "e.g. 300.00" : "None"}
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                />
              </div>
            </div>

            {/* Validity Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-starts-at">Starts At *</Label>
                <Input
                  id="offer-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offer-expires-at">Expires At *</Label>
                <Input
                  id="offer-expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div className="flex flex-col">
                <Label htmlFor="offer-active" className="cursor-pointer font-medium">
                  Offer Active Status
                </Label>
                <span className="text-xs text-muted-foreground">
                  When active and within date range, cashiers can apply this offer to orders
                </span>
              </div>
              <Switch id="offer-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Update Offer" : "Create Offer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
