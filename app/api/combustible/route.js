// Cargas de combustible (Cloudfleet) para la pestaña Combustible.
// La librería mantiene un snapshot acumulado en Vercel Blob y solo lee de la
// API las páginas nuevas; si la lectura inicial del histórico no entra en una
// invocación devuelve `parcial: true` y el cliente vuelve a pedir hasta
// completar. `?rebuild=1` fuerza re-leer todo el histórico desde cero.
import { getCombustible } from "../../../lib/combustible";

export const maxDuration = 300;

export async function GET(req) {
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return Response.json({ ok: true, entradas: [] });
  }
  try {
    const sp = new URL(req.url).searchParams;
    const rebuild = sp.get("rebuild") === "1";
    // `seguir=1` (continuación de una carga parcial) saltea el TTL.
    const ttlMs = sp.get("seguir") === "1" ? 0 : undefined;
    const r = await getCombustible({ rebuild, ...(ttlMs === 0 ? { ttlMs } : {}) });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
