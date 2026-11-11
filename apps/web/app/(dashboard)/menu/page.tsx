"use client";

import { EyeOff, Layers, Leaf, Pencil, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { AddCategoryDialog } from "@/components/menu/add-category-dialog";
import { ImportCsvDialog } from "@/components/imports/import-csv-dialog";
import { BulkPriceDialog } from "@/components/menu/bulk-price-dialog";
import { AddItemDialog } from "@/components/menu/add-item-dialog";
import { ComboComponentsDialog } from "@/components/menu/combo-components-dialog";
import { EditCategoryDialog } from "@/components/menu/edit-category-dialog";
import { EditItemDialog } from "@/components/menu/edit-item-dialog";
import { Badge } from "@/components/ui/badge";
import { UploadImage } from "@/components/ui/upload-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import {
  useCategories,
  useDeleteCategory,
  useDeleteMenuItem,
  useMenuItems,
  useUpdateMenuItem,
  type MenuCategory,
  type MenuItem,
} from "@/hooks/use-menu";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function MenuPage() {
  const { branchId } = useBranch();
  const { data: me } = useCurrentUser();
  // menu.view alone is read-only; every edit control needs menu.manage.
  const canManage = hasPermission(me?.user, "menu.manage");
  const { data: categories, isLoading: categoriesLoading } = useCategories(branchId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { data: items, isLoading: itemsLoading } = useMenuItems(branchId, selectedCategoryId);
  const { data: allItems } = useMenuItems(branchId);
  const deleteItem = useDeleteMenuItem(branchId);
  const deleteCategory = useDeleteCategory(branchId);
  const updateItem = useUpdateMenuItem(branchId);
  const [comboItem, setComboItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const sortedCategories = [...(categories ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

  const filteredItems = (items ?? []).filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      item.category.name.toLowerCase().includes(q)
    );
  });

  const onToggleAvailability = (item: MenuItem) => {
    if (!canManage) return;
    const next = !item.isAvailable;
    updateItem.mutate(
      { id: item.id, dto: { isAvailable: next } },
      {
        onSuccess: () =>
          toast.success(`"${item.name}" marked as ${next ? "Available" : "Unavailable"}`),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not update availability"),
      },
    );
  };

  const onDeleteCategory = (category: MenuCategory) => {
    if (!confirm(`Delete the "${category.name}" category? This cannot be undone.`)) return;
    deleteCategory.mutate(category.id, {
      onSuccess: () => {
        toast.success(`"${category.name}" deleted`);
        if (selectedCategoryId === category.id) setSelectedCategoryId(undefined);
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : "Could not delete category — remove its items first",
        ),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Menu</h1>
          <p className="text-sm text-muted-foreground">{canManage ? "Categories, items, and pricing" : "Categories, items, and pricing (view only)"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              Categories
            </h2>
          </div>

          {categoriesLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
            {/* Phones: one swipeable row of big tap-friendly chips. */}
            <div className="flex flex-col gap-3 lg:hidden">
              <ResponsiveTabs
                mobileOnly
                label="Category"
                value={selectedCategoryId ?? "all"}
                onChange={(id) => setSelectedCategoryId(id === "all" ? undefined : id)}
                items={[
                  { id: "all", label: "All items" },
                  ...sortedCategories.map((c) => ({
                    id: c.id,
                    label: c.name,
                    hint: `${c._count.items} items${c.isActive ? "" : " · inactive"}${c.showOnWebsite ? "" : " · hidden"}`,
                  })),
                ]}
              />
              {selectedCategory && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      {selectedCategory.name}
                      {!selectedCategory.isActive && (
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                          Inactive
                        </span>
                      )}
                    </span>
                    {!selectedCategory.showOnWebsite && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <EyeOff className="h-3 w-3" /> Hidden from website
                      </span>
                    )}
                  </span>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" className="h-10 gap-1.5 px-3" onClick={() => setEditingCategory(selectedCategory)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-10 gap-1.5 px-3 text-destructive" onClick={() => onDeleteCategory(selectedCategory)}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="hidden flex-col gap-1 lg:flex">
              <button
                onClick={() => setSelectedCategoryId(undefined)}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  !selectedCategoryId
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                All items
              </button>
              {sortedCategories.map((cat) => (
                <div
                  key={cat.id}
                  className={cn(
                    "group flex items-center justify-between rounded-lg pl-3 pr-1 py-1 text-left text-sm font-medium transition-colors",
                    selectedCategoryId === cat.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <button
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left"
                  >
                    <span className="truncate">{cat.name}</span>
                    {!cat.isActive && (
                      <span className="rounded bg-destructive/10 px-1 py-0.2 text-[10px] font-normal text-destructive">
                        Inactive
                      </span>
                    )}
                  </button>
                  {!cat.showOnWebsite && (
                    <span title="Hidden from website" className="mr-1 shrink-0 text-muted-foreground">
                      <EyeOff className="h-3.5 w-3.5" />
                      <span className="sr-only">Hidden from website</span>
                    </span>
                  )}
                  <span className={cn("shrink-0 text-xs text-muted-foreground", canManage && "group-hover:hidden")}>
                    {cat._count.items}
                  </span>
                  {canManage && (
                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        title="Edit category"
                        onClick={() => setEditingCategory(cat)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Delete category"
                        onClick={() => onDeleteCategory(cat)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </>
          )}

          {canManage && <AddCategoryDialog branchId={branchId} />}
        </Card>

        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[18px] font-medium text-foreground">Items</h2>
              <p className="text-xs text-muted-foreground">
                {selectedCategory ? `${selectedCategory.name} · ` : "All categories · "}
                {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search food items..."
                  className="h-9 pl-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {canManage && (
                <>
                  <BulkPriceDialog branchId={branchId} categories={categories ?? []} />
                  <ImportCsvDialog kind="menu" branchId={branchId} />
                  <AddItemDialog branchId={branchId} categories={categories ?? []} />
                </>
              )}
            </div>
          </div>

          {itemsLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <>
            <ul className="flex flex-col divide-y divide-border md:hidden">
              {filteredItems.map((item) => (
                <li key={item.id} className="flex flex-col gap-2.5 py-3.5 first:pt-0">
                  <div className="flex items-start gap-3">
                    {item.imageUrl ? (
                      <UploadImage src={item.imageUrl} width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg bg-secondary object-cover" />
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.isVeg && <Leaf className="h-3.5 w-3.5 shrink-0 text-success" />}
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        {item.isAvailable ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] py-0 px-1.5">
                            Available
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] py-0 px-1.5">
                            Unavailable
                          </Badge>
                        )}
                        {!item.isActive && (
                          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[10px] py-0 px-1.5">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.category.name}
                        {item.station ? ` · ${item.station.name}` : ""}
                        {` · ${Number(item.taxRatePercent)}% tax`}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCurrency(item.price)}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn("h-8 text-xs font-medium px-2.5", item.isAvailable ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}
                        onClick={() => onToggleAvailability(item)}
                      >
                        {item.isAvailable ? "Mark Sold Out" : "Mark Available"}
                      </Button>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className={cn("h-8 gap-1 px-2.5 text-xs", item.isCombo && "text-primary")} onClick={() => setComboItem(item)}>
                          <Layers className="h-3.5 w-3.5" /> Combo
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs" onClick={() => setEditingItem(item)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={`Delete ${item.name}`}
                          onClick={() =>
                            deleteItem.mutate(item.id, {
                              onSuccess: (res: any) =>
                                toast.success(res?.message || `${item.name} removed`),
                              onError: (err) =>
                                toast.error(err instanceof ApiError ? err.message : "Could not remove item"),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Food Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Station</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-3">
                        {item.imageUrl ? (
                          <UploadImage src={item.imageUrl} width={40} height={40} className="h-10 w-10 shrink-0 rounded-md bg-secondary object-cover" />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-md bg-secondary" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.isVeg && <Leaf className="h-3.5 w-3.5 shrink-0 text-success" />}
                            <span className="font-medium text-foreground truncate max-w-[24ch]" title={item.name}>
                              {item.name}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 max-w-[32ch]" title={item.description}>
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.category.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {item.isAvailable ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-normal"
                          >
                            Available
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-normal"
                          >
                            Unavailable
                          </Badge>
                        )}
                        {!item.isActive && (
                          <Badge
                            variant="outline"
                            className="border-destructive/30 bg-destructive/10 text-destructive text-xs font-normal"
                          >
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.station ? (
                        <Badge variant="secondary" className="font-normal">
                          {item.station.name}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(item.price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {Number(item.taxRatePercent)}%
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-8 px-2 text-xs",
                              item.isAvailable
                                ? "text-amber-600 hover:text-amber-700"
                                : "text-emerald-600 hover:text-emerald-700",
                            )}
                            title={item.isAvailable ? "Mark item sold out / unavailable" : "Mark item available"}
                            onClick={() => onToggleAvailability(item)}
                          >
                            {item.isAvailable ? "Sold out" : "Available"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8 text-muted-foreground hover:text-primary",
                              item.isCombo && "text-primary",
                            )}
                            title="Combo components"
                            onClick={() => setComboItem(item)}
                          >
                            <Layers className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title="Edit item"
                            onClick={() => setEditingItem(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Delete item"
                            onClick={() =>
                              deleteItem.mutate(item.id, {
                                onSuccess: (res: any) =>
                                  toast.success(res?.message || `${item.name} removed`),
                                onError: (err) =>
                                  toast.error(err instanceof ApiError ? err.message : "Could not remove item"),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {search ? "No items matching your search" : "No items yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {search
                  ? `No food items found matching "${search}". Clear the search query to see all items.`
                  : "Add a category, then add your first menu item."}
              </p>
              {search && (
                <Button variant="outline" size="sm" onClick={() => setSearch("")} className="mt-2">
                  Clear search
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <ComboComponentsDialog
        branchId={branchId}
        item={comboItem}
        allItems={allItems ?? []}
        open={!!comboItem}
        onOpenChange={(open) => !open && setComboItem(null)}
      />

      {editingCategory && (
        <EditCategoryDialog
          branchId={branchId}
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
        />
      )}

      {editingItem && (
        <EditItemDialog
          branchId={branchId}
          item={editingItem}
          categories={categories ?? []}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
