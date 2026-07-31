// app/api/debug/route.js — TEMPORAIRE, test OAuth netztransparenz.de
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.NETZTRANSPARENZ_CLIENT_ID;
  const clientSecret = process.env.NETZTRANSPARENZ_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Credentials manquants dans l'env" }, { status: 500 });
  }

  try {
    const tokenRes = await fetch("https://identity.netztransparenz.de/users/connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const tokenText = await tokenRes.text();
    let tokenJson;
    try { tokenJson = JSON.parse(tokenText); } catch { tokenJson = null; }

    const result = { token_status: tokenRes.status, token_body_preview: tokenText.slice(0, 300) };

    if (tokenJson?.access_token) {
      const healthRes = await fetch("https://ds.netztransparenz.de/api/v1/health", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      result.health_status = healthRes.status;
      result.health_body = (await healthRes.text()).slice(0, 300);
      result.token_expires_in = tokenJson.expires_in;
      result.token_type = tokenJson.token_type;
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
