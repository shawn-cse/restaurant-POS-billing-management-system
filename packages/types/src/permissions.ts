// Single source of truth for the granular permission list (spec: "Every
// permission should be individually configurable"). Backend seeds these as
// Permission rows; frontend uses the same keys to gate UI (buttons/routes).
// Extend this list as later-phase modules land — never hardcode a role
// check in business logic, always check a permission key.

export const PERMISSIONS = [
  { key: "sales.view", label: "View Sales", category: "Sales" },
  { key: "dashboard.sales.view", label: "View Dashboard Revenue & Sales Reports", category: "Sales" },
  { key: "orders.create", label: "Create Orders", category: "Orders" },
  { key: "orders.edit", label: "Edit Orders", category: "Orders" },
  { key: "orders.cancel", label: "Cancel Orders", category: "Orders" },
  { key: "orders.accept", label: "Accept / Decline Incoming Orders", category: "Orders" },
  { key: "discounts.apply", label: "Apply Discounts", category: "Orders" },
  { key: "discounts.unlimited", label: "Discount Above the Cashier Limit", category: "Orders" },
  { key: "refunds.process", label: "Process Refunds", category: "Orders" },
  { key: "orders.delete", label: "Delete Past Transactions (admin password)", category: "Orders" },
  { key: "bills.print", label: "Print Bills", category: "Orders" },
  { key: "tables.view", label: "View Floors & Tables (read-only)", category: "Tables" },
  { key: "tables.manage", label: "Manage Tables", category: "Tables" },
  { key: "menu.view", label: "View Menu (read-only)", category: "Menu" },
  { key: "menu.manage", label: "Manage Menu", category: "Menu" },
  { key: "inventory.manage", label: "Manage Inventory", category: "Inventory" },
  { key: "reports.access", label: "Access Reports", category: "Reports" },
  { key: "users.manage", label: "Manage Users", category: "Admin" },
  { key: "reports.financial.view", label: "View Financial Reports", category: "Reports" },
  { key: "data.export", label: "Export Data", category: "Reports" },
  { key: "kds.manage", label: "Manage Kitchen Display", category: "Kitchen" },
  { key: "reservations.manage", label: "Manage Reservations", category: "Reservations" },
  { key: "settings.manage", label: "Manage Settings", category: "Admin" },
  { key: "customers.manage", label: "Manage Customers & Loyalty", category: "CRM" },
  { key: "audit_log.view", label: "View Audit Log", category: "Admin" },
  { key: "roles.manage", label: "Manage Roles", category: "Admin" },
  { key: "backup.manage", label: "Manage Backups", category: "Admin" },
  { key: "attendance.manage", label: "Manage Staff Attendance", category: "Staff" },
  { key: "delivery.manage", label: "Manage Deliveries", category: "Delivery" },
  { key: "delivery.rider", label: "Use the Rider App (own deliveries)", category: "Delivery" },
  { key: "staff.manage", label: "Manage Staff Schedules, Leave & Payroll", category: "Staff" },
  { key: "accounting.manage", label: "Manage Accounting", category: "Accounting" },
  { key: "marketing.manage", label: "Manage Coupons, Promotions & Campaigns", category: "Marketing" },
  { key: "offers.view", label: "View Offers & Discounts (read-only)", category: "Marketing" },
  { key: "offers.manage", label: "Manage Promotional Offers & Discounts", category: "Marketing" },
  { key: "operations.manage", label: "Manage Equipment & Documents", category: "Operations" },
  { key: "system.update", label: "Manage App Updates", category: "Admin" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

// A "manage" permission always includes its read-only counterpart, so roles
// that predate the *.view keys (and custom roles) keep working unchanged.
export const PERMISSION_IMPLIES: Partial<Record<PermissionKey, PermissionKey[]>> = {
  "menu.manage": ["menu.view"],
  "tables.manage": ["tables.view"],
  "offers.manage": ["offers.view"],
};

/** True when `held` satisfies `required`, directly or through PERMISSION_IMPLIES. */
export function permissionSatisfied(held: readonly string[], required: string): boolean {
  if (held.includes(required)) return true;
  return Object.entries(PERMISSION_IMPLIES).some(
    ([owner, implied]) => held.includes(owner) && (implied as string[]).includes(required),
  );
}

// Dashboard revenue/trends and the sales-total reports. Deliberately NOT
// granted to Cashier, Waiter, or Kitchen Staff.
export const SALES_DASHBOARD_DEFAULT_ROLES = [
  "SUPER_ADMIN", "OWNER", "ADMINISTRATOR", "MANAGER", "RESTAURANT_MANAGER", "ACCOUNTANT",
] as const;

export const STAFF_ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "CASHIER",
  "WAITER",
  "KITCHEN_STAFF",
  "OWNER",
  "ADMINISTRATOR",
  "RESTAURANT_MANAGER",
  "CHEF",
  "BARTENDER",
  "DELIVERY_STAFF",
  "ACCOUNTANT",
  "INVENTORY_MANAGER",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  WAITER: "Waiter",
  KITCHEN_STAFF: "Kitchen Staff",
  OWNER: "Super Admin",
  ADMINISTRATOR: "Super Admin",
  RESTAURANT_MANAGER: "Manager",
  CHEF: "Chef",
  BARTENDER: "Bartender",
  DELIVERY_STAFF: "Delivery Staff",
  ACCOUNTANT: "Accountant",
  INVENTORY_MANAGER: "Inventory Manager",
};

export function isSuperAdmin(roleName?: string | null): boolean {
  if (!roleName) return false;
  return roleName === "SUPER_ADMIN" || roleName === "OWNER" || roleName === "ADMINISTRATOR";
}

export function isManager(roleName?: string | null): boolean {
  if (!roleName) return false;
  return roleName === "MANAGER" || roleName === "RESTAURANT_MANAGER";
}

// Default permission bundles per role — seeded on first boot, but every
// permission remains individually toggleable afterward (stored per-role in
// the DB, this is just the initial grant set).
export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, PermissionKey[]> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => p.key),
  OWNER: PERMISSIONS.map((p) => p.key),
  ADMINISTRATOR: PERMISSIONS.map((p) => p.key),
  MANAGER: [
    "sales.view", "dashboard.sales.view", "orders.create", "orders.edit", "orders.cancel", "orders.accept",
    "discounts.apply", "discounts.unlimited", "bills.print", "tables.manage", "tables.view", "menu.manage", "menu.view",
    "inventory.manage", "reports.access", "reports.financial.view", "data.export", "kds.manage",
    "reservations.manage", "customers.manage", "refunds.process",
    "attendance.manage", "delivery.manage", "staff.manage", "accounting.manage", "marketing.manage", "offers.manage", "offers.view", "operations.manage",
    "users.manage", "settings.manage",
  ],
  RESTAURANT_MANAGER: [
    "sales.view", "dashboard.sales.view", "orders.create", "orders.edit", "orders.cancel", "orders.accept",
    "discounts.apply", "discounts.unlimited", "bills.print", "tables.manage", "tables.view", "menu.manage", "menu.view",
    "inventory.manage", "reports.access", "reports.financial.view", "data.export", "kds.manage",
    "reservations.manage", "customers.manage", "refunds.process",
    "attendance.manage", "delivery.manage", "staff.manage", "accounting.manage", "marketing.manage", "offers.manage", "offers.view", "operations.manage",
    "users.manage", "settings.manage",
  ],
  CASHIER: [
    "orders.create", "orders.edit", "orders.accept", "bills.print", "discounts.apply", "offers.view",
    "sales.view", "customers.manage", "tables.view", "menu.view",
  ],
  // Waiters create and run orders from the menu and floor plan, but cannot confirm payments
  // (no bills.print), cannot advance kitchen preparation (no kds.manage), and cannot view revenue reports.
  WAITER: [
    "orders.create", "orders.edit", "orders.accept", "tables.view", "menu.view",
  ],
  KITCHEN_STAFF: [
    "kds.manage", "orders.accept", "menu.view",
  ],
  CHEF: ["kds.manage", "orders.accept", "menu.manage", "menu.view"],
  BARTENDER: ["orders.create", "orders.accept", "kds.manage", "menu.view", "tables.view"],
  DELIVERY_STAFF: ["orders.edit", "delivery.manage", "delivery.rider"],
  ACCOUNTANT: ["sales.view", "dashboard.sales.view", "reports.access", "reports.financial.view", "data.export", "accounting.manage"],
  INVENTORY_MANAGER: ["inventory.manage", "reports.access"],
};
