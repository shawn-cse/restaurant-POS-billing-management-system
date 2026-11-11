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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUpdateCategory, type MenuCategory } from "@/hooks/use-menu";
import { ApiError } from "@/lib/api";

// Mounted only while a specific category is being edited (see MenuPage),
// keyed by category.id — same pattern as EditRoleDialog.
export function EditCategoryDialog({
  branchId,
  category,
  onClose,
}: {
  branchId: string | null;
  category: MenuCategory;
  onClose: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category.isActive ?? true);
  const [showOnWebsite, setShowOnWebsite] = useState(category.showOnWebsite);
  const updateCategory = useUpdateCategory(branchId);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCategory.mutate(
      {
        id: category.id,
        dto: {
          name: name.trim(),
          sortOrder: Math.max(Number(sortOrder) || 0, 0),
          isActive,
          showOnWebsite,
        },
      },
      {
        onSuccess: () => {
          toast.success(`"${name}" updated`);
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not update category"),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="category-edit-name">Name</Label>
            <Input
              id="category-edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Starters"
              required
              autoFocus
            />
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="category-edit-sort">Display Order</Label>
            <Input
              id="category-edit-sort"
              type="number"
              min="0"
              step="1"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
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
            <Button type="submit" disabled={updateCategory.isPending}>
              {updateCategory.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
