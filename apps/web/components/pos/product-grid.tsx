"use client";

import { useState } from "react";
import { UploadImage } from "@/components/ui/upload-image";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { useCategories, useMenuItems, type MenuItem } from "@/hooks/use-menu";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProductGrid({
  branchId,
  onSelect,
}: {
  branchId: string | null;
  onSelect: (item: MenuItem) => void;
}) {
  const { data: categories } = useCategories(branchId);
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { data: items, isLoading, isError, error, refetch, isFetching } = useMenuItems(branchId, activeCategoryId);

  const filtered = items?.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full flex-col gap-4">
      <Input
        placeholder="Search menu…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11"
      />

      {categories && categories.length > 0 && (
        <ResponsiveTabs
          mobileOnly
          className="lg:hidden"
          label="Category"
          value={activeCategoryId ?? "all"}
          onChange={(id) => setActiveCategoryId(id === "all" ? undefined : id)}
          desktopListClassName="justify-start lg:h-auto lg:flex-wrap"
          items={[{ id: "all", label: "All" }, ...categories.map((c) => ({ id: c.id, label: c.name, hint: `${c._count.items} items` }))]}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-5">
      {categories && categories.length > 0 && (
        <nav
          aria-label="Category"
          className="hidden w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border pr-3 lg:flex xl:w-60"
        >
          {[{ id: undefined as string | undefined, name: "All", count: undefined as number | undefined }, ...categories.map((c) => ({ id: c.id as string | undefined, name: c.name, count: c._count.items as number | undefined }))].map((c) => {
            const active = c.id === activeCategoryId;
            return (
              <button
                key={c.id ?? "all"}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => setActiveCategoryId(c.id)}
                className={cn(
                  "flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                    : "font-medium text-foreground hover:bg-secondary",
                )}
              >
                <span className="min-w-0 [overflow-wrap:anywhere] leading-tight" title={c.name}>
                  {c.name}
                </span>
                {c.count !== undefined && (
                  <span className={cn("shrink-0 text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {isError && !items ? (
        <QueryError error={error} what="the menu" onRetry={() => void refetch()} retrying={isFetching} />
      ) : (
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-4 sm:grid-cols-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        {filtered?.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.name}
            onClick={() => onSelect(item)}
            className="group relative flex min-h-24 min-w-0 flex-col justify-between gap-2 rounded-2xl border border-border/80 bg-card p-3.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md active:scale-[0.98] lg:min-h-32 lg:p-4"
          >
            {item.imageUrl ? (
              <div className="relative h-20 w-full overflow-hidden rounded-xl bg-muted/60">
                <UploadImage
                  src={item.imageUrl}
                  width={240}
                  height={80}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  alt={item.name}
                />
                <span
                  className={cn(
                    "absolute top-2 left-2 h-2.5 w-2.5 rounded-full ring-2 ring-background shadow-sm",
                    item.isVeg ? "bg-success" : "bg-destructive",
                  )}
                  title={item.isVeg ? "Vegetarian" : "Non-Vegetarian"}
                />
                {item.isCombo && (
                  <span className="absolute top-2 right-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground shadow-sm">
                    Combo
                  </span>
                )}
              </div>
            ) : (
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full ring-2 ring-background",
                    item.isVeg ? "bg-success" : "bg-destructive",
                  )}
                  title={item.isVeg ? "Vegetarian" : "Non-Vegetarian"}
                />
                {item.isCombo && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    Combo
                  </span>
                )}
              </div>
            )}
            <span className="line-clamp-2 w-full min-w-0 [overflow-wrap:anywhere] text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary lg:text-[15px]">
              {item.name}
            </span>
            <div className="flex w-full items-baseline justify-between gap-2 border-t border-border/40 pt-2">
              <span className="text-sm font-bold tabular-nums text-foreground lg:text-base">
                {formatCurrency(item.price)}
              </span>
              {item.halfPrice != null && (
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  Half {formatCurrency(item.halfPrice)}
                </span>
              )}
            </div>
          </button>
        ))}
        {filtered?.length === 0 && !isLoading && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {search ? <>No items match &quot;{search}&quot;</> : "No items in this category yet"}
          </p>
        )}
      </div>
      )}
      </div>
      </div>
    </div>
  );
}
