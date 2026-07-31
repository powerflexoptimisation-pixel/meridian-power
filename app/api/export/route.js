// app/api/export/route.js
// Usage:
//   /api/export?countries=DE,FR&from=2026-06-01&to=2026-06-30&resolution=day
//   resolution: "day" | "hour" | "raw" (raw = points bruts 15-min, non agrégés)
// Renvoie un CSV téléchargeable.

import { DOMAINS } from "../../../lib/entsoe";
import { getPriceStatsBucketed, getPriceHistory } from "../../../lib/db";
import { berlinMidnightUTC, berlinDateToUTC } from "../../../lib/tz";

export const dynamic = "force-dynamic";

function csvEscape(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const countriesParam = searchParams.get("countries") || searchParams.get("country") || "";
  const countries = [...new Set(countriesParam.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))];

  if (countries.length === 0) {
    return new Response("Paramètre country ou countries requis.", { status: 400 });
  }
  for (const c of countries) {
    if (!DOMAINS[c]) return new Response(`Marché inconnu: ${c}`, { status: 400 });
  }

  const resolution = ["day", "hour", "raw"].includes(searchParams.get("resolution")) ? searchParams.get("resolution") : "day";

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  let from, to;
  if (fromParam && toParam) {
    from = berlinDateToUTC(fromParam);
    to = new Date(berlinDateToUTC(toParam).getTime() + 24 * 3600 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return new Response("Plage from/to invalide.", { status: 400 });
    }
  } else {
    const days = Math.min(Math.max(Number(searchParams.get("days") || "30"), 1), 730);
    to = berlinMidnightUTC(0);
    from = berlinMidnightUTC(days);
  }

  try {
    const rows = [];
    if (resolution === "raw") {
      rows.push(["country", "timestamp_utc", "price_eur_mwh"]);
      for (const c of countries) {
        const points = await getPriceHistory(c, from.toISOString(), to.toISOString());
        for (const p of points) rows.push([c, p.timestamp, p.price_eur_mwh]);
      }
    } else {
      rows.push(["country", "period_start", `avg_eur_mwh`, "min_eur_mwh", "max_eur_mwh"]);
      for (const c of countries) {
        const series = await getPriceStatsBucketed(c, from.toISOString(), to.toISOString(), resolution);
        for (const s of series) rows.push([c, s.bucket, s.avg.toFixed(2), s.min.toFixed(2), s.max.toFixed(2)]);
      }
    }

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `meridian-power_${countries.join("-")}_${resolution}_${dateTag}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(`Erreur: ${String(err.message || err)}`, { status: 502 });
  }
}
