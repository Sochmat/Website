import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return NextResponse.json({ results: [], error: "Missing API key" });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:in&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }
    const data = await res.json();
    const predictions = data.predictions ?? [];

    // Fetch place details for each prediction to get lat/lng
    const results = await Promise.all(
      predictions.slice(0, 5).map(async (p: { place_id: string; description: string }) => {
        try {
          const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=geometry,address_component&key=${apiKey}`;
          const detailRes = await fetch(detailUrl);
          const detailData = await detailRes.json();
          const loc = detailData.result?.geometry?.location;
          const components = detailData.result?.address_components ?? [];
          const pincodeComp = components.find((c: { types: string[] }) =>
            c.types.includes("postal_code"),
          );
          return {
            address: p.description,
            lat: loc?.lat ?? 0,
            lng: loc?.lng ?? 0,
            pincode: pincodeComp?.long_name ?? null,
          };
        } catch {
          return { address: p.description, lat: 0, lng: 0, pincode: null };
        }
      }),
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Geocode search error:", err);
    return NextResponse.json({ results: [] });
  }
}
