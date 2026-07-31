"use client";

import { useState, useEffect } from "react";

// Hook + bouton de bascule sombre/clair, persistés en localStorage et
// appliqués via l'attribut data-theme sur <html> (voir globals.css).
export function useTheme() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("mp-theme", next);
    } catch (e) {
      // localStorage indisponible (mode privé strict) — le thème reste actif pour la session en cours
    }
  }

  return { theme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="px-2 py-1 text-xs font-mono border border-[var(--mp-border)] text-[var(--mp-text-4)] hover:border-[var(--mp-border-hover)] hover:text-[var(--mp-text-2)] transition-colors flex items-center gap-1.5"
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? (
        <>
          <span aria-hidden="true">&#9789;</span> Dark
        </>
      ) : (
        <>
          <span aria-hidden="true">&#9728;</span> Light
        </>
      )}
    </button>
  );
}
