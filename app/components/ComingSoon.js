"use client";

export default function ComingSoon({ title, description }) {
  return (
    <div className="min-h-screen bg-[var(--mp-bg)] text-[var(--mp-text-2)]" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <header className="border-b border-[var(--mp-border)] px-6 py-4">
        <h1 className="text-sm tracking-[0.15em] text-[var(--mp-text-1)] font-mono uppercase">{title}</h1>
      </header>
      <main className="p-6 max-w-2xl">
        <div className="border border-[var(--mp-border)] bg-[var(--mp-panel)] p-8 text-center">
          <div className="text-xs font-mono tracking-[0.2em] text-amber-400 uppercase mb-3">Coming soon</div>
          <p className="text-sm text-[var(--mp-text-4)]">{description}</p>
        </div>
      </main>
    </div>
  );
}
