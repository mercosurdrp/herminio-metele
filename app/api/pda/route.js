// Planes de acción (PDA) de adherencia de checklists.
// Persisten como un JSON en Vercel Blob (no hay base de datos).
// 🚨 NO sobrescribir un mismo pathname: el CDN de Blob sirve la copia vieja
// un rato (verificado acá: una edición "se deshacía" al releer). Cada guardado
// escribe un archivo nuevo `pda/planes-<ts>.json` (URL nueva = sin caché) y
// borra las versiones anteriores; se lee el de timestamp más alto vía list().
import { put, list, del } from "@vercel/blob";

// Cada ámbito (página) guarda sus planes en su propio prefijo de Blob.
const PREFIJOS = {
  checklist: "pda/planes-",
  estandar: "pda-estandar/planes-",
};
const ESTADOS = new Set(["no_iniciado", "en_curso", "cumplido"]);

function prefijoDe(ambito) {
  return PREFIJOS[ambito] || PREFIJOS.checklist;
}

async function leerPlanes(prefijo) {
  try {
    const { blobs } = await list({ prefix: prefijo });
    if (!blobs.length) return [];
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return []; // todavía no hay planes guardados (primer uso)
  }
}

async function guardarPlanes(prefijo, planes) {
  const nuevo = await put(`${prefijo}${Date.now()}.json`, JSON.stringify(planes), {
    access: "public",
    addRandomSuffix: false,
  });
  // Limpieza de versiones anteriores (best effort: si falla, solo queda basura).
  try {
    const { blobs } = await list({ prefix: prefijo });
    const viejos = blobs.filter((b) => b.url !== nuevo.url).map((b) => b.url);
    if (viejos.length) await del(viejos);
  } catch {}
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
    const prefijo = prefijoDe(new URL(req.url).searchParams.get("ambito"));
    return Response.json({ ok: true, planes: await leerPlanes(prefijo) });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (esBuild(req)) return Response.json({ ok: false, error: "build" }, { status: 400 });
  try {
    const { accion, plan, ambito } = await req.json();
    const prefijo = prefijoDe(ambito);
    let planes = await leerPlanes(prefijo);

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

    await guardarPlanes(prefijo, planes);
    return Response.json({ ok: true, planes });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
