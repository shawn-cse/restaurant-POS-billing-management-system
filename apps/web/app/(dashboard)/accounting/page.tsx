"use client";

import { useState } from "react";
import { Edit2, Filter, PlusCircle, Search, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccountingActions,
  useBranchOverview,
  useClosingPreview,
  useClosings,
  useExpenses,
  useGst,
  useProfitLoss,
  type ExpenseRow,
} from "@/hooks/use-accounting";
import { useBranch } from "@/hooks/use-branch";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BalanceSheetTab, BankTab, BudgetsTab } from "@/components/accounting/finance-tabs";

const EXPENSE_PRESET_CATEGORIES = [
  "Rent",
  "Electricity",
  "Utilities",
  "Staff Salary",
  "Maintenance",
  "Supplies",
  "Marketing",
  "Other",
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");
const TABS = ["expenses", "cash close", "profit & loss", "balance sheet", "budgets", "bank", "gst", "branches"] as const;
type Tab = (typeof TABS)[number];

function monthRange() {
  const now = new Date();
  return {
    from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    to: iso(now),
  };
}

function RangePicker({
  range,
  onChange,
}: {
  range: { from: string; to: string };
  onChange: (r: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input type="date" className="w-40" value={range.from} onChange={(e) => onChange({ ...range, from: e.target.value })} />
      <Input type="date" className="w-40" value={range.to} onChange={(e) => onChange({ ...range, to: e.target.value })} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between py-1.5 text-sm", strong && "border-t border-border font-semibold")}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Expenses({ branchId }: { branchId: string | null }) {
  const [range, setRange] = useState(monthRange);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading } = useExpenses(
    branchId,
    range.from,
    range.to,
    categoryFilter,
    searchQuery,
  );
  const { addExpense, updateExpense, deleteExpense } = useAccountingActions(branchId);

  const [f, setF] = useState({
    spentOn: iso(new Date()),
    title: "",
    category: "Supplies",
    customCategory: "",
    amount: "",
    note: "",
    paidFromCash: false,
  });

  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [editForm, setEditForm] = useState({
    spentOn: "",
    title: "",
    category: "",
    customCategory: "",
    amount: "",
    note: "",
    paidFromCash: false,
  });

  const total = data?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
  const tillTotal = data?.filter((e) => e.paidFromCash).reduce((s, e) => s + Number(e.amount), 0) ?? 0;

  const submit = () => {
    const amount = Number(f.amount);
    const category = f.category === "Other" && f.customCategory.trim() ? f.customCategory.trim() : f.category;
    if (!category.trim() || !(amount > 0)) {
      return toast.error("Please enter a category and a valid amount in BDT");
    }
    addExpense.mutate(
      {
        spentOn: f.spentOn,
        title: f.title.trim() || undefined,
        category: category.trim(),
        amount,
        note: f.note.trim() || undefined,
        paidFromCash: f.paidFromCash,
      },
      {
        onSuccess: () => {
          toast.success("Expense recorded successfully");
          setF({
            spentOn: iso(new Date()),
            title: "",
            category: "Supplies",
            customCategory: "",
            amount: "",
            note: "",
            paidFromCash: false,
          });
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  };

  const startEdit = (e: ExpenseRow) => {
    setEditingExpense(e);
    const isPreset = (EXPENSE_PRESET_CATEGORIES as readonly string[]).includes(e.category);
    setEditForm({
      spentOn: e.spentOn.slice(0, 10),
      title: e.title ?? "",
      category: isPreset ? e.category : "Other",
      customCategory: isPreset ? "" : e.category,
      amount: String(e.amount),
      note: e.note ?? "",
      paidFromCash: e.paidFromCash,
    });
  };

  const saveEdit = () => {
    if (!editingExpense) return;
    const amount = Number(editForm.amount);
    const category =
      editForm.category === "Other" && editForm.customCategory.trim()
        ? editForm.customCategory.trim()
        : editForm.category;

    if (!category.trim() || !(amount > 0)) {
      return toast.error("Please specify a category and a positive amount in BDT");
    }

    updateExpense.mutate(
      {
        id: editingExpense.id,
        dto: {
          spentOn: editForm.spentOn,
          title: editForm.title.trim() || undefined,
          category: category.trim(),
          amount,
          note: editForm.note.trim() || undefined,
          paidFromCash: editForm.paidFromCash,
        },
      },
      {
        onSuccess: () => {
          toast.success("Expense updated");
          setEditingExpense(null);
        },
        onError: (err) => toast.error(errMsg(err)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Create Expense Card */}
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary" />
            Record Operating Expense
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Log overheads such as rent, utility bills, staff compensation, and restaurant supplies.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Expense Date</Label>
            <Input type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Expense Title</Label>
            <Input
              placeholder="e.g. October Rent, Generator Fuel"
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              {EXPENSE_PRESET_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {f.category === "Other" && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Custom Category</Label>
              <Input
                placeholder="Specify category..."
                value={f.customCategory}
                onChange={(e) => setF({ ...f, customCategory: e.target.value })}
              />
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Amount (TK. / BDT)</Label>
            <Input
              placeholder="Amount in TK."
              inputMode="decimal"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Description / Note</Label>
            <Input
              placeholder="Vendor, receipt # or details (optional)"
              value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-input text-primary focus:ring-primary h-4 w-4"
              checked={f.paidFromCash}
              onChange={(e) => setF({ ...f, paidFromCash: e.target.checked })}
            />
            Paid directly from cashier till cash
          </label>
          <Button onClick={submit} disabled={addExpense.isPending}>
            Record Expense
          </Button>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker range={range} onChange={setRange} />
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {EXPENSE_PRESET_CATEGORIES.filter((c) => c !== "Other").map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              className="pl-8 w-56"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {(categoryFilter !== "ALL" || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryFilter("ALL");
                setSearchQuery("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Total Filtered Expenses</span>
          <span className="text-xl font-bold text-foreground mt-1 tabular-nums">{formatCurrency(total)}</span>
        </Card>
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Paid From Till</span>
          <span className="text-xl font-bold text-warning mt-1 tabular-nums">{formatCurrency(tillTotal)}</span>
        </Card>
        <Card className="p-3.5 flex flex-col justify-between">
          <span className="text-xs text-muted-foreground">Records Count</span>
          <span className="text-xl font-bold text-foreground mt-1 tabular-nums">{data?.length ?? 0}</span>
        </Card>
      </div>

      {/* Expenses Table/List */}
      <Card className="flex flex-col divide-y divide-border p-2">
        {isLoading ? (
          <Skeleton className="m-4 h-16" />
        ) : data && data.length > 0 ? (
          <>
            {data.map((e) => (
              <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-secondary/30 transition-colors rounded-md">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {e.title ? e.title : e.category}
                    </span>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {e.category}
                    </Badge>
                    {e.paidFromCash && (
                      <Badge variant="outline" className="text-[11px] font-normal border-warning/40 text-warning">
                        Till Cash
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{e.spentOn.slice(0, 10)}</span>
                    {e.note && <span>· {e.note}</span>}
                    <span>· Recorded by {e.createdBy?.name || "Staff"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(e.amount)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => startEdit(e)}>
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => deleteExpense.mutate(e.id, { onError: (err) => toast.error(errMsg(err)) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 text-sm font-semibold">
              <span>Total Recorded</span>
              <span className="tabular-nums text-foreground">{formatCurrency(total)}</span>
            </div>
          </>
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No expenses found matching the selected filters and date range.
          </p>
        )}
      </Card>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Operating Expense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Expense Date</Label>
              <Input
                type="date"
                value={editForm.spentOn}
                onChange={(e) => setEditForm({ ...editForm, spentOn: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Expense title"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
              >
                {EXPENSE_PRESET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            {editForm.category === "Other" && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Custom Category</Label>
                <Input
                  value={editForm.customCategory}
                  onChange={(e) => setEditForm({ ...editForm, customCategory: e.target.value })}
                  placeholder="Custom category name"
                />
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Amount (TK.)</Label>
              <Input
                inputMode="decimal"
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Note / Description</Label>
              <Input
                value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                checked={editForm.paidFromCash}
                onChange={(e) => setEditForm({ ...editForm, paidFromCash: e.target.checked })}
              />
              Paid from till cash
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingExpense(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={updateExpense.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CashClose({ branchId }: { branchId: string | null }) {
  const [date, setDate] = useState(() => iso(new Date()));
  const [floor, setFloor] = useState("0");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const { data: preview } = useClosingPreview(branchId, date, Number(floor) || 0);
  const { data: closings } = useClosings(branchId);
  const { closeDay } = useAccountingActions(branchId);
  const variance = preview && counted !== "" ? Number(counted) - preview.expectedCash : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-3">
          <Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input className="w-40" inputMode="decimal" placeholder="Opening float" value={floor} onChange={(e) => setFloor(e.target.value)} />
        </div>
        {preview && (
          <div>
            <Row label="Opening float" value={formatCurrency(preview.openingFloat)} />
            <Row label="Cash sales (net of cash refunds)" value={formatCurrency(preview.cashSales)} />
            <Row label="Cash expenses" value={`− ${formatCurrency(preview.cashExpenses)}`} />
            <Row strong label="Expected in till" value={formatCurrency(preview.expectedCash)} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Input className="w-40" inputMode="decimal" placeholder="Counted cash" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {variance != null && (
            <span className={cn("text-sm", variance === 0 ? "text-success" : "text-destructive")}>
              {variance === 0 ? "Balanced" : `${variance > 0 ? "Over" : "Short"} by ${formatCurrency(Math.abs(variance))}`}
            </span>
          )}
        </div>
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div>
          <Button
            disabled={counted === "" || closeDay.isPending}
            onClick={() =>
              closeDay.mutate(
                { businessDate: date, openingFloat: Number(floor) || 0, countedCash: Number(counted), note: note || undefined },
                { onSuccess: () => { toast.success("Day closed"); setCounted(""); setNote(""); }, onError: (e) => toast.error(errMsg(e)) },
              )
            }
          >
            Close day
          </Button>
        </div>
      </Card>
      <Card className="flex flex-col divide-y divide-border p-2">
        {closings && closings.length > 0 ? (
          closings.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{c.businessDate.slice(0, 10)}</span>
              <span className="text-muted-foreground">
                expected {formatCurrency(c.expectedCash)} · counted {formatCurrency(c.countedCash)} · variance {formatCurrency(c.variance)}
              </span>
            </div>
          ))
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">No closed days yet.</p>
        )}
      </Card>
    </div>
  );
}

function ProfitLossTab({ branchId }: { branchId: string | null }) {
  const [range, setRange] = useState(monthRange);
  const { data } = useProfitLoss(branchId, range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <RangePicker range={range} onChange={setRange} />
      <Card className="p-4">
        {data ? (
          <div>
            <Row label={`Collected from ${data.orders} paid orders (excl. tips)`} value={formatCurrency(data.grossCollected)} />
            <Row label="Tax collected" value={`− ${formatCurrency(data.taxCollected)}`} />
            <Row label="Refunds" value={`− ${formatCurrency(data.refunds)}`} />
            <Row strong label="Net sales" value={formatCurrency(data.netSales)} />
            {data.expenses.map((e) => (
              <Row key={e.category} label={e.category} value={`− ${formatCurrency(e.amount)}`} />
            ))}
            <Row label="Payroll (finalized runs)" value={`− ${formatCurrency(data.payrollCost)}`} />
            <Row strong label="Net profit" value={formatCurrency(data.netProfit)} />
          </div>
        ) : (
          <Skeleton className="h-32" />
        )}
      </Card>
    </div>
  );
}

function GstTab({ branchId }: { branchId: string | null }) {
  const [range, setRange] = useState(monthRange);
  const { data } = useGst(branchId, range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <RangePicker range={range} onChange={setRange} />
      <Card className="overflow-x-auto p-4">
        {data ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1">Rate</th><th>Taxable value</th><th>Tax</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.ratePercent} className="border-t border-border">
                  <td className="py-1.5">{r.ratePercent}%</td>
                  <td>{formatCurrency(r.taxableValue)}</td>
                  <td>{formatCurrency(r.tax)}</td>
                  <td className="text-right">{formatCurrency(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5">Total</td>
                <td>{formatCurrency(data.totalTaxable)}</td>
                <td>{formatCurrency(data.totalTax)}</td>
                <td className="text-right">{formatCurrency(data.totalTaxable + data.totalTax)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <Skeleton className="h-24" />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Based on paid orders in the range, with each bill&rsquo;s discounts applied pro-rata. Use it as a working
          summary; have your accountant confirm filings.
        </p>
      </Card>
    </div>
  );
}

function BranchesTab() {
  const [range, setRange] = useState(monthRange);
  const { data } = useBranchOverview(range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <RangePicker range={range} onChange={setRange} />
      <Card className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1">Branch</th><th>Orders</th><th>Sales</th><th>Open</th><th>Low stock</th><th className="text-right">Inventory value</th></tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.branchId} className="border-t border-border">
                <td className="py-1.5">{b.name}</td>
                <td>{b.orders}</td>
                <td>{formatCurrency(b.sales)}</td>
                <td>{b.openOrders}</td>
                <td>{b.lowStockItems}</td>
                <td className="text-right">{formatCurrency(b.inventoryValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function AccountingPage() {
  const { branchId } = useBranch();
  const [tab, setTab] = useState<Tab>("expenses");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Accounting</h1>
        <p className="text-sm text-muted-foreground">Expenses, cash close, profit &amp; loss, balance sheet, budgets, bank reconciliation, tax and branches</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3.5 py-1 text-xs capitalize transition-colors",
              tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "expenses" && <Expenses branchId={branchId} />}
      {tab === "cash close" && <CashClose branchId={branchId} />}
      {tab === "profit & loss" && <ProfitLossTab branchId={branchId} />}
      {tab === "balance sheet" && <BalanceSheetTab branchId={branchId} />}
      {tab === "budgets" && <BudgetsTab branchId={branchId} />}
      {tab === "bank" && <BankTab branchId={branchId} />}
      {tab === "gst" && <GstTab branchId={branchId} />}
      {tab === "branches" && <BranchesTab />}
    </div>
  );
}
