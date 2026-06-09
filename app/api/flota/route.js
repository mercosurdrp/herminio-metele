import { NextResponse } from "next/server";
import { getChecklists } from "../../../lib/cloudfleet";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

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

    const datos = await getChecklists(desde, hasta);

    return NextResponse.json({
      ok: true,
      desde,
      hasta,
      total: datos.length,
      actualizado: new Date().toISOString(),
      datos,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
