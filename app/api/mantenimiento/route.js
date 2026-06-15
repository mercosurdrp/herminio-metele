import { NextResponse } from "next/server";
import { buildMantenimiento, SNAP_MANTENIMIENTO } from "../../../lib/mantenimiento";
import { claveRango } from "../../../lib/cloudfleet";
import { servirConSnapshot, refrescarSnapshot } from "../../../lib/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
// Margen para los reintentos ante el rate limit de Cloudfleet.
export const maxDuration = 300;

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return arg.toISOString().slice(0, 10);
}
function restarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(req) {
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ ok: true, desde: null, hasta: null, flota: null, vehiculos: [] });
  }
  try {
    const { searchParams } = new URL(req.url);
    const hasta = searchParams.get("hasta") || hoyArg();
    let desde = searchParams.get("desde") || restarDias(hasta, 364);
    // La API de Cloudfleet no admite rangos de más de 365 días.
    if (restarDias(hasta, 364) > desde) desde = restarDias(hasta, 364);
    const fresco = searchParams.get("fresco") === "1";

    const clave = claveRango(desde, hasta);
    const construir = () => buildMantenimiento(desde, hasta);
    const payload = fresco
      ? await refrescarSnapshot({ espacio: SNAP_MANTENIMIENTO, clave, construir })
      : await servirConSnapshot({ espacio: SNAP_MANTENIMIENTO, clave, construir });

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
