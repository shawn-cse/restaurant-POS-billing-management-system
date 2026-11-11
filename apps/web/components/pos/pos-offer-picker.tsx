"use client";

import type { OfferEvaluationResult } from "@nodedr-restaurant/types";
import { Check, Percent, Sparkles, Tag, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvailableOffers } from "@/hooks/use-offers";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PosOfferPicker({
  branchId,
  subtotal,
  selectedOffer,
  onSelectOffer,
  disabled = false,
}: {
  branchId: string | null;
  subtotal: number;
  selectedOffer?: OfferEvaluationResult | null;
  onSelectOffer: (offer: OfferEvaluationResult | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: availableOffers, isLoading } = useAvailableOffers(branchId, subtotal);
  const offersList = (availableOffers ?? []) as OfferEvaluationResult[];

  const eligibleCount = offersList.length;

  if (selectedOffer) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <div className="flex flex-col">
            <span className="font-semibold text-emerald-900 dark:text-emerald-200">
              {selectedOffer.offerName ?? "Promotional Offer"}
            </span>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Savings: {formatCurrency(selectedOffer.discountAmount)}
            </span>
          </div>
        </div>

        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-emerald-800 hover:bg-emerald-500/20 hover:text-emerald-950"
            onClick={() => onSelectOffer(null)}
            title="Remove offer"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || subtotal <= 0}
        onClick={() => setOpen(true)}
        className="w-full justify-between h-9 text-xs border-dashed"
      >
        <span className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-primary" />
          Apply Promotional Offer
        </span>
        {eligibleCount > 0 ? (
          <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">
            {eligibleCount} available
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">None</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Promotional Offers for this Order
            </DialogTitle>
            <DialogDescription>
              Current order subtotal: <strong>{formatCurrency(subtotal)}</strong>. Select an authorized offer to apply.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5 py-2 max-h-[350px] overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
              </div>
            ) : offersList.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Tag className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-foreground">No eligible offers for this bill</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Offers may have expired, or order subtotal does not meet minimum spend requirements.
                </p>
              </div>
            ) : (
              (offersList as any[]).map((offer) => {
                const isSelected = false;
                const isPercentage = offer.offerType === "PERCENTAGE";

                return (
                  <button
                    key={offer.offerId}
                    type="button"
                    onClick={() => {
                      onSelectOffer(offer);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-xl border-2 p-3 text-left transition hover:border-primary/50 hover:bg-muted/30",
                      isSelected && "border-emerald-500 bg-emerald-500/10",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        {isPercentage ? <Percent className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground text-sm">
                          {offer.offerName}
                        </div>
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                          Saves {formatCurrency(offer.discountAmount)}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
