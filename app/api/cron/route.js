import { NextResponse } from "next/server";
import { buildChecklists, SNAP_CHECKLIST, claveRango } from "../../../lib/cloudfleet";
import { buildMantenimiento, SNAP_MANTENIMIENTO } from "../../../lib/mantenimiento";
import { getCombustible } from "../../../lib/combustible";
import { guardarSnap } from "../../../lib/snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 300;

function restarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// Cron diario: deja pre-guardada la vista por defecto de cada tarjeta para que
// una mañana de auditoría abra al instante con datos del día ya cargados.
export async function GET() {
  // No ejecutar la sincronización durante el build.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ ok: true, skipped: "build" });
  }
  try {
    const arg = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hoy = arg.toISOString().slice(0, 10);

    // Checklist: vista por defecto = últimos 7 días (igual que la página).
    const chkDesde = restarDias(hoy, 7);
    const checklist = await buildChecklists(chkDesde, hoy);
    await guardarSnap(SNAP_CHECKLIST, claveRango(chkDesde, hoy), checklist);

    // Mantenimiento: vista por defecto = últimos 364 días (igual que la página).
    const mntDesde = restarDias(hoy, 364);
    const mantenimiento = await buildMantenimiento(mntDesde, hoy);
    await guardarSnap(SNAP_MANTENIMIENTO, claveRango(mntDesde, hoy), mantenimiento);

    // Combustible: refresco incremental de su propio snapshot (1-2 páginas/día).
    let combustible = null;
    try {
      const c = await getCombustible({ ttlMs: 0 });
      combustible = c.entradas.length;
    } catch {}

    return NextResponse.json({
      ok: true,
      checklist: checklist.total,
      mantenimiento: mantenimiento.vehiculos?.length ?? 0,
      combustible,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
