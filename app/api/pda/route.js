// Planes de acción (PDA) de adherencia de checklists.
// Persisten como un JSON único en Vercel Blob (no hay base de datos).
import { put, head } from "@vercel/blob";

const RUTA = "pda/planes.json";
const ESTADOS = new Set(["no_iniciado", "en_curso", "cumplido"]);

async function leerPlanes() {
  try {
    const info = await head(RUTA);
    // Cache-bust: el CDN de Blob puede servir una copia vieja tras un
    // overwrite; sin esto un PDA recién guardado "desaparece" al recargar.
    const res = await fetch(`${info.url}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return []; // el blob todavía no existe (primer uso)
  }
}

async function guardarPlanes(planes) {
  await put(RUTA, JSON.stringify(planes), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

function limpiarTexto(v, max = 500) {
  return String(v ?? "").trim().slice(0, max);
}

function esBuild(req) {
  return !req?.url || process.env.NEXT_PHASE === "phase-production-build";
}

export async function GET(req) {
  if (esBuild(req)) return Response.json({ ok: true, planes: [] });
  try {
    return Response.json({ ok: true, planes: await leerPlanes() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (esBuild(req)) return Response.json({ ok: false, error: "build" }, { status: 400 });
  try {
    const { accion, plan } = await req.json();
    let planes = await leerPlanes();

    if (accion === "crear") {
      const nuevo = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        accion: limpiarTexto(plan?.accion),
        responsable: limpiarTexto(plan?.responsable, 120),
        vence: limpiarTexto(plan?.vence, 10),
        estado: ESTADOS.has(plan?.estado) ? plan.estado : "no_iniciado",
        comentario: limpiarTexto(plan?.comentario),
        creado: new Date().toISOString(),
      };
      if (!nuevo.accion || !nuevo.responsable || !nuevo.vence) {
        return Response.json(
          { ok: false, error: "Faltan acción, responsable o fecha de vencimiento" },
          { status: 400 }
        );
      }
      planes.push(nuevo);
    } else if (accion === "editar") {
      const i = planes.findIndex((p) => p.id === plan?.id);
      if (i === -1) return Response.json({ ok: false, error: "PDA no encontrado" }, { status: 404 });
      const p = planes[i];
      if (plan.estado !== undefined && ESTADOS.has(plan.estado)) p.estado = plan.estado;
      if (plan.vence !== undefined) p.vence = limpiarTexto(plan.vence, 10);
      if (plan.comentario !== undefined) p.comentario = limpiarTexto(plan.comentario);
      if (plan.accion !== undefined) p.accion = limpiarTexto(plan.accion) || p.accion;
      if (plan.responsable !== undefined) p.responsable = limpiarTexto(plan.responsable, 120) || p.responsable;
    } else if (accion === "borrar") {
      planes = planes.filter((p) => p.id !== plan?.id);
    } else {
      return Response.json({ ok: false, error: "Acción inválida" }, { status: 400 });
    }

    await guardarPlanes(planes);
    return Response.json({ ok: true, planes });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
