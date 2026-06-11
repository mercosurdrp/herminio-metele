// TEMPORAL: diagnóstico de los endpoints de Cloudfleet (borrar al terminar).
// Protegido por ?k= para no exponer la API en una página pública.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function GET(req) {
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return Response.json({ ok: true });
  }
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "herminio-debug-2026") {
    return Response.json({ ok: false }, { status: 404 });
  }
  const key = process.env.CLOUDFLEET_API_KEY;
  const path = u.searchParams.get("path") || "work-orders/labors/";
  const res = await fetch(`https://fleet.cloudfleet.com/api/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": UA,
    },
    cache: "no-store",
  });
  const txt = await res.text();
  return Response.json({
    status: res.status,
    headers: Object.fromEntries([...res.headers.entries()].filter(([k]) => k.startsWith("x-"))),
    body: txt.slice(0, 2500),
  });
}
