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
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hoy = arg.toISOString().slice(0, 10);
  const out = { ok: true };

  // Cada tarjeta en su propio try/catch: si una falla por el límite de
  // Cloudfleet, las otras igual dejan su copia fresca para el día.

  // Checklist: vista por defecto = últimos 7 días (igual que la página).
  try {
    const chkDesde = restarDias(hoy, 7);
    const checklist = await buildChecklists(chkDesde, hoy);
    await guardarSnap(SNAP_CHECKLIST, claveRango(chkDesde, hoy), checklist);
    out.checklist = checklist.total;
  } catch (e) {
    out.checklistError = String(e?.message || e);
  }

  // Mantenimiento: vista por defecto = últimos 364 días (igual que la página).
  try {
    const mntDesde = restarDias(hoy, 364);
    const mantenimiento = await buildMantenimiento(mntDesde, hoy);
    await guardarSnap(SNAP_MANTENIMIENTO, claveRango(mntDesde, hoy), mantenimiento);
    out.mantenimiento = mantenimiento.vehiculos?.length ?? 0;
  } catch (e) {
    out.mantenimientoError = String(e?.message || e);
  }

  // Combustible: refresco incremental de su propio snapshot (1-2 páginas/día).
  try {
    const c = await getCombustible({ ttlMs: 0 });
    out.combustible = c.entradas.length;
  } catch (e) {
    out.combustibleError = String(e?.message || e);
  }

  return NextResponse.json(out);
}
