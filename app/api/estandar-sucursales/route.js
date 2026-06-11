// Mapa patente → sucursal desde el padrón de Cloudfleet, para el filtro de
// sucursal de la página Estándar (la planilla no trae sucursal).
import { getMapaSucursales } from "../../../lib/cloudfleet";

export async function GET(req) {
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return Response.json({ ok: true, sucursales: {} });
  }
  try {
    return Response.json({ ok: true, sucursales: await getMapaSucursales() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
