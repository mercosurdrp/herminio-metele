import { NextResponse } from "next/server";
import { getChecklists } from "../../../lib/cloudfleet";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// Cron diario: precarga/refresca los checklists del último mes para que la
// pestaña abra siempre con datos frescos del día.
export async function GET() {
  // No ejecutar la sincronización durante el build.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ ok: true, skipped: "build" });
  }
  try {
    const ahora = new Date();
    const arg = new Date(ahora.getTime() - 3 * 60 * 60 * 1000);
    const hasta = arg.toISOString().slice(0, 10);
    const d = new Date(hasta + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 31);
    const desde = d.toISOString().slice(0, 10);

    const datos = await getChecklists(desde, hasta);
    return NextResponse.json({ ok: true, desde, hasta, total: datos.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
