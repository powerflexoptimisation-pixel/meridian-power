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
    const candidates = [
      "https://ds.netztransparenz.de/swagger/v1/swagger.json",
      "https://ds.netztransparenz.de/api/v1/swagger.json",
      "https://ds.netztransparenz.de/swagger/index.html",
    ];
    const results = {};
    for (const url of candidates) {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const text = await res.text();
        results[url] = { status: res.status, preview: text.slice(0, 2000) };
      } catch (e) {
        results[url] = { error: String(e.message || e) };
      }
    }
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
