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
  const token = (await tokenRes.json()).access_token;

  // Chercher le pic max de Wind Onshore ENTSO-E sur les 30 derniers jours
  // n'est pas possible ici (pas de connexion DB dans ce debug volontairement
  // minimal) — on teste juste plusieurs jours au hasard sur le dernier mois.
  const dates = ["2026-08-10", "2026-08-20", "2026-09-01", "2026-09-05"];
  const results = {};
  for (const d of dates) {
    const res = await fetch(`https://ds.netztransparenz.de/api/v1/data/hochrechnung/Wind/${d}T12:00:00/${d}T13:00:00`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    results[d] = await res.text();
  }
  return NextResponse.json(results);
}
