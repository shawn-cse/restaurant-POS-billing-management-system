"use client";

import { useQuery } from "@tanstack/react-query";
import { Calendar, Download, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SchedulesPanel } from "@/components/reports/schedules-panel";

interface CatalogEntry {
  key: string;
  title: string;
  group: string;
}
interface ReportResult {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const isCurrencyColumn = (columnName: string) =>
  /sales|revenue|refund|discount|tax|amount|cost|profit|spend|price|subtotal|value|margin|tender|expenses|less/i.test(
    columnName,
  );

export default function ReportsPage() {
  const { branchId } = useBranch();
  const { data: me } = useCurrentUser();
  const canExport = hasPermission(me?.user, "data.export");
  const [key, setKey] = useState("sales-daily");
  const [range, setRange] = useState(() => ({
    from: iso(new Date(Date.now() - 29 * 86_400_000)),
    to: iso(new Date()),
  }));

  const setPreset = (preset: "today" | "week" | "month" | "30d") => {
    const now = new Date();
    const todayStr = iso(now);
    if (preset === "today") {
      setRange({ from: todayStr, to: todayStr });
    } else if (preset === "week") {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      setRange({ from: iso(monday), to: todayStr });
    } else if (preset === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setRange({ from: iso(first), to: todayStr });
    } else if (preset === "30d") {
      const past = new Date(Date.now() - 29 * 86_400_000);
      setRange({ from: iso(past), to: todayStr });
    }
  };

  const { data: catalog } = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () => api.get<CatalogEntry[]>("/reports"),
  });
  const qs = `branchId=${branchId}&from=${range.from}&to=${range.to}`;
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", key, branchId, range.from, range.to],
    queryFn: () => api.get<ReportResult>(`/reports/${key}?${qs}`),
    enabled: !!branchId && range.from <= range.to,
    retry: false,
  });

  const groups = [...new Set(catalog?.map((c) => c.group))];

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Sales &amp; Operational Reports</h1>
        <p className="text-sm text-muted-foreground">
          View daily, weekly, monthly and custom sales summaries in Asia/Dhaka time. Export to Excel, PDF or CSV.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="flex flex-col gap-4 print:hidden" aria-label="Reports">
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">{g}</p>
              {catalog
                ?.filter((c) => c.group === g)
                .map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setKey(c.key)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                      key === c.key ? "bg-primary text-primary-foreground font-medium" : "text-foreground hover:bg-secondary",
                    )}
                  >
                    {c.title}
                  </button>
                ))}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            {/* Quick date presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Presets:
              </span>
              <Button size="sm" variant="outline" className="h-8 text-xs px-2.5" onClick={() => setPreset("today")}>
                Today
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs px-2.5" onClick={() => setPreset("week")}>
                This Week
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs px-2.5" onClick={() => setPreset("month")}>
                This Month
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs px-2.5" onClick={() => setPreset("30d")}>
                Last 30 Days
              </Button>
            </div>

            {/* Date Pickers & Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" className="w-36 h-8 text-xs" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              <Input type="date" className="w-36 h-8 text-xs" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
              </Button>
              {canExport &&
                (["xlsx", "pdf", "csv"] as const).map((f) => (
                  <a
                    key={f}
                    href={`/api/v1/reports/${key}/export?${qs}&format=${f}`}
                    className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-secondary transition-colors"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" /> {f === "xlsx" ? "Excel" : f.toUpperCase()}
                  </a>
                ))}
            </div>
          </div>

          <Card className="overflow-x-auto p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold text-foreground">{data?.title ?? catalog?.find((c) => c.key === key)?.title}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                Period: {range.from} to {range.to} (Asia/Dhaka)
              </span>
            </div>

            {isLoading ? (
              <Skeleton className="h-40" />
            ) : error ? (
              <p className="text-sm text-destructive py-4">{error instanceof ApiError ? error.message : "Could not load report"}</p>
            ) : data && data.rows.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b border-border">
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c} className="py-2 pr-4 font-semibold">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-secondary/20 transition-colors">
                      {r.map((cell, j) => {
                        const colName = data.columns[j] ?? "";
                        const formatted =
                          typeof cell === "number" && isCurrencyColumn(colName)
                            ? formatCurrency(cell)
                            : cell ?? "—";
                        return (
                          <td key={j} className="py-2.5 pr-4 tabular-nums">
                            {formatted}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No transaction records found for this period.</p>
            )}
          </Card>

          {canExport && (
            <SchedulesPanel
              branchId={branchId}
              reportKey={key}
              titles={Object.fromEntries((catalog ?? []).map((c) => [c.key, c.title]))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
