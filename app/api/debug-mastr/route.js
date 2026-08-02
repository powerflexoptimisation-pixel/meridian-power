import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") || "Energieträger~eq~2497";
  const page = searchParams.get("page") || "1";
  const pageSize = searchParams.get("pageSize") || "3";
  const url = `https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetErweiterteOeffentlicheEinheitStromerzeugung?filter=${encodeURIComponent(filter)}&page=${page}&pageSize=${pageSize}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return NextResponse.json({
      status: res.status,
      total: json.Total,
      dataCount: json.Data ? json.Data.length : 0,
      errors: json.Errors,
      sample: json.Data ? json.Data.slice(0, 2).map(d => ({
        EinheitName: d.EinheitName, Breitengrad: d.Breitengrad, Laengengrad: d.Laengengrad,
        Nettonennleistung: d.Nettonennleistung, BetriebsStatusName: d.BetriebsStatusName,
        WindAnLandOderSeeBezeichnung: d.WindAnLandOderSeeBezeichnung, NabenhoeheWindenergieanlage: d.NabenhoeheWindenergieanlage,
        Bundesland: d.Bundesland, InbetriebnahmeDatum: d.InbetriebnahmeDatum,
      })) : [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
