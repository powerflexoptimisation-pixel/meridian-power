// app/api/debug/route.js — TEMPORAIRE
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getToken() {
  const tokenRes = await fetch("https://identity.netztransparenz.de/users/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.NETZTRANSPARENZ_CLIENT_ID,
      client_secret: process.env.NETZTRANSPARENZ_CLIENT_SECRET,
    }),
  });
  const json = await tokenRes.json();
  return json.access_token;
}

export async function GET() {
  try {
    const token = await getToken();
    const dateFrom = "2026-07-29T00:00:00";
    const dateTo = "2026-07-30T00:00:00";
    const paths = [
      `https://ds.netztransparenz.de/api/v1/data/NrvSaldo/reBAP/Qualitaetsgesichert?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      `https://ds.netztransparenz.de/api/v1/data/redispatch?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      `https://ds.netztransparenz.de/api/v1/data/NrvSaldo/RZSaldo/Qualitaetsgesichert?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    ];
    const results = {};
    for (const url of paths) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      results[url] = { status: res.status, contentType: res.headers.get("content-type"), preview: text.slice(0, 800) };
    }
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
