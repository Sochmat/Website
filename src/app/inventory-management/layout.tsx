"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogoutOutlined,
  ArrowLeftOutlined,
  DashboardOutlined,
  SlidersOutlined,
  FallOutlined,
  PlusSquareOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  TagsOutlined,
  SettingOutlined,
  DownOutlined,
  RightOutlined,
  MenuOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { useAdminRole } from "@/lib/useAdminRole";
import { inventoryGateRedirect, useAdminToken } from "@/lib/adminClientAuth";

const SETUP_PREFIX = "/inventory-management/setup";

// Sidebar navigation, in display order. A `children` entry renders as a
// collapsible group; everything else is a plain link.
const NAV_ITEMS: {
  href?: string;
  label: string;
  icon: React.ReactNode;
  children?: { href: string; label: string }[];
}[] = [
  {
    href: "/inventory-management/dashboard",
    label: "Dashboard",
    icon: <DashboardOutlined />,
  },
  {
    href: "/inventory-management/adjustment",
    label: "Audit",
    icon: <SlidersOutlined />,
  },
  {
    href: "/inventory-management/stock-consumption",
    label: "Stock Consumption",
    icon: <FallOutlined />,
  },
  {
    href: "/inventory-management/add-stock",
    label: "Add Stock",
    icon: <PlusSquareOutlined />,
  },
  {
    href: "/inventory-management/wastage",
    label: "Wastage",
    icon: <DeleteOutlined />,
  },
  {
    href: "/inventory-management/stocks",
    label: "Stocks",
    icon: <DatabaseOutlined />,
  },
  {
    href: "/inventory-management/price-comparison",
    label: "Price Comparison",
    icon: <TagsOutlined />,
  },
  {
    label: "Setup",
    icon: <SettingOutlined />,
    children: [
      { href: `${SETUP_PREFIX}/raw-material`, label: "Raw Material" },
      { href: `${SETUP_PREFIX}/production`, label: "Production" },
      { href: `${SETUP_PREFIX}/item-recipe`, label: "Item Recipe" },
      { href: `${SETUP_PREFIX}/addon-recipe`, label: "Addons Recipe" },
    ],
  },
];

/**
 * Shell for the inventory-management console.
 *
 * Auth piggybacks on the admin session: `src/middleware.ts` requires a valid
 * `admin_session` cookie for everything under /inventory-management, so an
 * unauthenticated visitor never reaches this component. The localStorage checks
 * below are UI sugar only (same contract as the admin layout) — they keep the
 * client from flashing a shell it will immediately navigate away from.
 */
export default function InventoryManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAdminToken();
  const role = useAdminRole();
  // Mobile only — the sidebar is always visible from `md` up.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // null = follow the route (auto-expand while inside Setup); true/false once
  // the user has clicked the group header. Derived rather than synced in an
  // effect, so there is no set-state-in-effect to trip the lint rule.
  const [setupToggled, setSetupToggled] = useState<boolean | null>(null);

  const setupActive = pathname.startsWith(SETUP_PREFIX);
  const setupOpen = setupToggled ?? setupActive;

  // `token` is undefined until localStorage has actually been read (the server
  // render and the hydration pass that matches it), and inventoryGateRedirect
  // stays put for that state. Redirecting there is what used to bounce a
  // perfectly valid session to the login page on every reload.
  useEffect(() => {
    const target = inventoryGateRedirect(token, role);
    if (target) router.replace(target);
  }, [token, role, router]);

  const handleLogout = async () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    // Clear the server session cookie too, so the token can't be reused.
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore — local state is cleared regardless
    }
    router.replace("/admin/login");
  };

  // Undefined on the server and during hydration (so the two renders agree);
  // the real value arrives on the client render right after, at which point the
  // effect above has redirected if there is genuinely no session.
  if (!token) return null;

  const linkClass = (active: boolean, indented = false) =>
    `flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors ${
      indented ? "pl-9 pr-3" : "px-3"
    } ${
      active
        ? "bg-white text-[#111] shadow-sm"
        : "text-gray-300 hover:bg-white/10 hover:text-white"
    }`;

  const sidebarNav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => {
        if (!item.children) {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href!}
              aria-current={active ? "page" : undefined}
              onClick={() => setDrawerOpen(false)}
              className={linkClass(active)}
            >
              <span className="shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        }

        return (
          <div key={item.label} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setSetupToggled(!setupOpen)}
              aria-expanded={setupOpen}
              className={`${linkClass(false)} w-full justify-between`}
            >
              <span className="flex items-center gap-2.5">
                <span className="shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </span>
              <span className="text-[10px] opacity-70">
                {setupOpen ? <DownOutlined /> : <RightOutlined />}
              </span>
            </button>
            {setupOpen &&
              item.children.map((child) => {
                const active = pathname === child.href;
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={linkClass(active, true)}
                  >
                    {child.label}
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-40 bg-[#1c1c1c] text-white shadow-sm">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              className="md:hidden inline-flex items-center justify-center rounded-lg border border-white/15 w-9 h-9 text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              {drawerOpen ? <CloseOutlined /> : <MenuOutlined />}
            </button>
            <Link
              href="/inventory-management"
              className="flex items-center gap-2.5 shrink-0"
            >
              <span className="w-8 h-8 rounded-lg bg-[#024731] flex items-center justify-center font-bold text-sm text-white">
                S
              </span>
              <span className="leading-tight">
                <span className="block font-bold tracking-tight">Sochmat</span>
                <span className="block text-[11px] text-gray-400 -mt-0.5">
                  Inventory management
                </span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              <ArrowLeftOutlined />
              <span className="hidden sm:inline">Admin console</span>
            </Link>
            <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogoutOutlined />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop: static sidebar. Sticky under the 4rem header. */}
        <aside className="hidden md:block w-56 shrink-0 bg-[#1c1c1c] text-white sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r border-white/10">
          {sidebarNav}
        </aside>

        {/* Mobile: slide-over drawer. */}
        {drawerOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 top-16 z-30 bg-black/50"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <aside className="md:hidden fixed left-0 top-16 z-40 w-56 h-[calc(100vh-4rem)] overflow-y-auto bg-[#1c1c1c] text-white border-r border-white/10 shadow-xl">
              {sidebarNav}
            </aside>
          </>
        )}

        <main className="flex-1 min-w-0 p-6">{children}</main>
      </div>
    </div>
  );
}
