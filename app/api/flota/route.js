import { NextResponse } from "next/server";
import { buildChecklists, SNAP_CHECKLIST, claveRango } from "../../../lib/cloudfleet";
import { servirConSnapshot, refrescarSnapshot } from "../../../lib/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
// Margen para los reintentos ante el rate limit de Cloudfleet (rangos largos).
export const maxDuration = 300;

// Fecha de hoy en hora Argentina (YYYY-MM-DD).
function hoyArg() {
  const ahora = new Date();
  const arg = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
  return arg.toISOString().slice(0, 10);
}

function restarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(req) {
  // Durante el build, Next ejecuta el handler con `req` undefined (fase "Collecting
  // page data"). Cortamos temprano para no crashear ni pegarle a Cloudfleet en build.
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ ok: true, desde: null, hasta: null, total: 0, datos: [] });
  }
  try {
    const { searchParams } = new URL(req.url);
    const hasta = searchParams.get("hasta") || hoyArg();
    const desde = searchParams.get("desde") || restarDias(hasta, 30);
    const fresco = searchParams.get("fresco") === "1";

    const clave = claveRango(desde, hasta);
    const construir = () => buildChecklists(desde, hasta);
    // fresco=1 → en vivo de Cloudfleet (actualizado); sino → copia guardada (rápido).
    const payload = fresco
      ? await refrescarSnapshot({ espacio: SNAP_CHECKLIST, clave, construir })
      : await servirConSnapshot({ espacio: SNAP_CHECKLIST, clave, construir });

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
