// Estándar de flota para consumo externo (dpo-distribuciones, Misiones) vía
// proxy. Devuelve la planilla digerida (datos.json) + el padrón patente→sucursal
// de Cloudfleet en una sola llamada. Si Cloudfleet falla, igual responde los
// datos del estándar (sin sucursales) para no dejar la página en blanco.
import datos from "../../estandar/datos.json";
import { getMapaSucursales } from "../../../lib/cloudfleet";

export async function GET(req) {
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return Response.json({ ok: true, datos, sucursales: {} });
  }
  try {
    return Response.json({ ok: true, datos, sucursales: await getMapaSucursales() });
  } catch {
    return Response.json({ ok: true, datos, sucursales: {} });
  }
}
