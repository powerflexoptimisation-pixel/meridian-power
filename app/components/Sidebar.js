"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { label: "Home", href: "/" },
  { label: "Marchés", href: "/marches" },
  { label: "Grid Real Time", href: "/grid-realtime" },
  {
    label: "Analysis",
    badge: "Standard",
    children: [
      { label: "Spread Analysis", href: "/analysis/spread" },
      { label: "Residual Load Analysis", href: "/analysis/residual-load" },
      { label: "Cross Border Analysis", href: "/analysis/cross-border" },
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
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupHasActiveChild(pathname, item) {
  return item.children?.some((c) => isActive(pathname, c.href));
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
        {NAV.map((item) => {
          if (!item.children) {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 text-xs font-mono tracking-wide ${
                  active
                    ? "text-amber-400 bg-[var(--mp-bg)] border-l-2 border-amber-400"
                    : "text-[var(--mp-text-4)] border-l-2 border-transparent hover:text-[var(--mp-text-2)]"
                }`}
              >
                {item.label}
              </Link>
            );
          }
          const groupActive = groupHasActiveChild(pathname, item);
          const isOpen = collapsed[item.label] !== undefined ? collapsed[item.label] : groupActive || false;
          return (
            <div key={item.label} className="mt-1">
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [item.label]: !isOpen }))}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-mono tracking-wide text-[var(--mp-text-5)] uppercase hover:text-[var(--mp-text-3)]"
              >
                <span className="flex items-center gap-2">
                  {item.label}
                  <span className="text-[9px] text-[var(--mp-text-6)] normal-case border border-[var(--mp-border)] px-1 rounded-sm">{item.badge}</span>
                </span>
                <span className="text-[var(--mp-text-6)]">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="ml-2 border-l border-[var(--mp-border)]">
                  {item.children.map((c) => {
                    const active = isActive(pathname, c.href);
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={`block pl-4 pr-4 py-1.5 text-xs font-mono ${
                          active ? "text-amber-400" : "text-[var(--mp-text-5)] hover:text-[var(--mp-text-2)]"
                        }`}
                      >
                        {c.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-[var(--mp-border)] text-[9px] font-mono text-[var(--mp-text-6)]">
        DE · FR · IT · ES
      </div>
    </aside>
  );
}
