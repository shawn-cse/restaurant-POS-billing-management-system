"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCreateCategory } from "@/hooks/use-menu";
import { ApiError } from "@/lib/api";

export function AddCategoryDialog({ branchId }: { branchId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [showOnWebsite, setShowOnWebsite] = useState(true);
  const createCategory = useCreateCategory(branchId);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCategory.mutate(
      {
        name: name.trim(),
        sortOrder: Math.max(Number(sortOrder) || 0, 0),
        isActive,
        showOnWebsite,
      },
      {
        onSuccess: () => {
          toast.success(`"${name}" category added`);
          setOpen(false);
          setName("");
          setSortOrder("0");
          setIsActive(true);
          setShowOnWebsite(true);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not add category"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Add category
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rice, Chicken, Beef, Fast Food..."
              required
              autoFocus
            />
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="category-sort">Display Order</Label>
            <Input
              id="category-sort"
              type="number"
              min="0"
              step="1"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first on POS and menu tabs.</p>
          </div>
          <label className="mb-3 flex min-h-12 items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Active category</span>
              <span className="text-xs text-muted-foreground">
                Off deactivates this category across all menus.
              </span>
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active category" />
          </label>
          <label className="mb-4 flex min-h-12 items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Show on website</span>
              <span className="text-xs text-muted-foreground">
                Off hides this category from your website and online/QR ordering. It stays on the POS.
              </span>
            </span>
            <Switch checked={showOnWebsite} onCheckedChange={setShowOnWebsite} aria-label="Show on website" />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={createCategory.isPending}>
              {createCategory.isPending ? "Adding…" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
