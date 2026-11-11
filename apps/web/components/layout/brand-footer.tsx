export function BrandFooter() {
  return (
    <div className="flex flex-col gap-2 border-t border-sidebar-border px-4 py-3">
      <div className="flex items-center justify-between text-xs text-sidebar-foreground/70">
        <div className="flex items-center gap-1.5 font-semibold text-sidebar-foreground/90">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span>UrbanBite Restaurant</span>
        </div>
        <span className="text-[11px] tabular-nums text-sidebar-foreground/50">POS</span>
      </div>
    </div>
  );
}
