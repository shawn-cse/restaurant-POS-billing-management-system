import {
  BellRing,
  CalendarClock,
  ChefHat,
  LayoutDashboard,
  ClipboardList,
  LayoutGrid,
  Settings,
  ShoppingCart,
  Tag,
  UsersRound,
  UtensilsCrossed,
  Landmark,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.sales.view" },
  { labelKey: "nav.pos", href: "/pos", icon: ShoppingCart, permission: "orders.create" },
  { labelKey: "nav.waiter", href: "/waiter", icon: BellRing, permission: "orders.create" },
  { labelKey: "nav.kds", href: "/kds", icon: ChefHat, permission: "kds.manage" },
  { labelKey: "nav.orders", href: "/orders", icon: ClipboardList, permission: "orders.create" },
  { labelKey: "nav.tables", href: "/tables", icon: LayoutGrid, permission: "tables.view" },
  {
    labelKey: "nav.reservations",
    href: "/reservations",
    icon: CalendarClock,
    permission: "reservations.manage",
  },
  { labelKey: "nav.menu", href: "/menu", icon: UtensilsCrossed, permission: "menu.view" },
  { labelKey: "nav.offers", href: "/offers", icon: Tag, permission: "offers.view" },
  { labelKey: "nav.customers", href: "/customers", icon: UsersRound, permission: "customers.manage" },
  { labelKey: "nav.accounting", href: "/accounting", icon: Landmark, permission: "accounting.manage" },
  { labelKey: "nav.reports", href: "/reports", icon: BarChart3, permission: "reports.access" },
  { labelKey: "nav.settings", href: "/settings", icon: Settings, permission: "settings.manage" },
];
