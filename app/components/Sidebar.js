"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { label: "Home", href: "/" },
  { label: "Marchés", href: "/marches" },
  { label: "Grid Real Time", href: "/grid-realtime" },
  { label: "Forecast for Trading", href: "/forecast-trading" },
  { label: "Portfolio", href: "/portfolio" },
  {
    label: "Analysis",
    badge: "Standard",
    children: [
      { label: "Spread Analysis", href: "/analysis/spread" },
      { label: "Residual Load Analysis", href: "/analysis/residual-load" },
      { label: "Cross Border Analysis", href: "/analysis/cross-border" },
      {
        label: "Forecast Analysis",
        children: [
          { label: "Generation Forecast Analysis", href: "/analysis/forecast/generation" },
        ],
      },
    ],
  },
  {
    label: "Forecast",
    badge: "Standard",
    children: [
      { label: "Generation Forecast", href: "/forecast/generation" },
      { label: "Consumption Forecast", href: "/forecast/consumption" },
      { label: "Cross Border Forecast", href: "/forecast/cross-border" },
      { label: "Grid Status Forecast", href: "/forecast/grid-status" },
    ],
  },
];

function isActive(pathname, href) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupHasActiveChild(pathname, item) {
  if (!item.children) return false;
  return item.children.some((c) => (c.children ? groupHasActiveChild(pathname, c) : isActive(pathname, c.href)));
}

// Rendu récursif: gère un nombre arbitraire de niveaux d'imbrication (utilisé
// pour Analysis > Forecast Analysis > Generation Forecast Analysis, un
// niveau de plus que le reste de la nav).
function NavNode({ item, pathname, depth, collapsed, setCollapsed }) {
  if (!item.children) {
    const active = isActive(pathname, item.href);
    return (
      <Link
        href={item.href}
        className={`block pr-4 py-1.5 text-xs font-mono ${depth === 0 ? "px-4 tracking-wide" : "pl-4"} ${
          active
            ? `text-amber-400 ${depth === 0 ? "bg-[var(--mp-bg)] border-l-2 border-amber-400" : ""}`
            : `text-[var(--mp-text-${depth === 0 ? "4" : "5"})] ${depth === 0 ? "border-l-2 border-transparent" : ""} hover:text-[var(--mp-text-2)]`
        }`}
        style={depth > 0 ? { paddingLeft: `${16 + depth * 12}px` } : undefined}
      >
        {item.label}
      </Link>
    );
  }
  const groupActive = groupHasActiveChild(pathname, item);
  const key = `${depth}:${item.label}`;
  const isOpen = collapsed[key] !== undefined ? collapsed[key] : groupActive;
  return (
    <div className={depth === 0 ? "mt-1" : ""}>
      <button
        onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !isOpen }))}
        className={`w-full flex items-center justify-between pr-4 py-1.5 text-xs font-mono text-[var(--mp-text-5)] hover:text-[var(--mp-text-3)] ${
          depth === 0 ? "px-4 tracking-wide uppercase" : ""
        }`}
        style={depth > 0 ? { paddingLeft: `${16 + depth * 12}px` } : undefined}
      >
        <span className="flex items-center gap-2">
          {item.label}
          {item.badge && <span className="text-[9px] text-[var(--mp-text-6)] normal-case border border-[var(--mp-border)] px-1 rounded-sm">{item.badge}</span>}
        </span>
        <span className="text-[var(--mp-text-6)]">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && (
        <div className="ml-2 border-l border-[var(--mp-border)]">
          {item.children.map((c) => (
            <NavNode key={c.href || c.label} item={c} pathname={pathname} depth={depth + 1} collapsed={collapsed} setCollapsed={setCollapsed} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState({});

  return (
    <aside
      className="w-56 shrink-0 border-r border-[var(--mp-border)] bg-[var(--mp-panel)] flex flex-col"
      style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}
    >
      <div className="px-4 py-4 border-b border-[var(--mp-border)]">
        <Link href="/" className="text-sm font-mono tracking-[0.15em] text-[var(--mp-text-1)] font-semibold uppercase">
          Meridian Power
        </Link>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV.map((item) => (
          <NavNode key={item.href || item.label} item={item} pathname={pathname} depth={0} collapsed={collapsed} setCollapsed={setCollapsed} />
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-[var(--mp-border)] text-[9px] font-mono text-[var(--mp-text-6)]">
        DE · FR · IT · ES
      </div>
    </aside>
  );
}
