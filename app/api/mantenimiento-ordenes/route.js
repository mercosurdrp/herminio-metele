// Órdenes de trabajo de mantenimiento (Cloudfleet) para el dashboard
// de la pestaña Mantenimiento. Trae todo y el cliente filtra.
import { getOrdenes } from "../../../lib/ordenes";

// La carga inicial pagina varias ventanas de la API de Cloudfleet y puede
// tener que esperar el rate limit (30 req/min) — darle margen.
export const maxDuration = 120;

export async function GET(req) {
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return Response.json({ ok: true, ordenes: [] });
  }
  try {
    const ordenes = await getOrdenes();
    return Response.json({ ok: true, ordenes, actualizado: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
