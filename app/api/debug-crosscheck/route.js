import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const tokenRes = await fetch("https://identity.netztransparenz.de/users/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "cm_app_ntp_id_c2f4105fa5274d009462513a0d2e4ff5",
      client_secret: "ntp_k1hTO7De2KPhipddxiH1",
    }),
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token;

  const res = await fetch("https://ds.netztransparenz.de/api/v1/data/hochrechnung/Wind/2026-09-05T02:00:00/2026-09-05T03:00:00", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return NextResponse.json({ status: res.status, raw: text });
}
