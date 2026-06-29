// Revisión de techos de camiones (carga manual).
// Persisten como un JSON en Vercel Blob (no hay base de datos), igual que los
// planes de acción (/api/pda).
// 🚨 NO sobrescribir un mismo pathname: el CDN de Blob sirve la copia vieja un
// rato. Cada guardado escribe un archivo nuevo `techos/revisiones-<ts>.json`
// (URL nueva = sin caché) y borra las versiones anteriores; se lee el de
// timestamp más alto vía list().
import { put, list, del } from "@vercel/blob";

const PREFIJO = "techos/revisiones-";
const ESTADOS = new Set(["pendiente", "en_curso", "corregido"]);

async function leerRevisiones() {
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    if (!blobs.length) return [];
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return []; // todavía no hay revisiones guardadas (primer uso)
  }
}

async function guardarRevisiones(revisiones) {
  const nuevo = await put(`${PREFIJO}${Date.now()}.json`, JSON.stringify(revisiones), {
    access: "public",
    addRandomSuffix: false,
  });
  // Limpieza de versiones anteriores (best effort: si falla, solo queda basura).
  try {
    const { blobs } = await list({ prefix: PREFIJO });
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

// Normaliza una revisión que llega del cliente a la forma guardada.
function normalizar(r) {
  return {
    fecha: limpiarTexto(r?.fecha, 10), // fecha de revisión
    patente: limpiarTexto(r?.patente, 20).toUpperCase(),
    falla: limpiarTexto(r?.falla, 300), // falla detectada en el techo
    accion: limpiarTexto(r?.accion, 300), // acción para corregir la falla
    fechaProgramada: limpiarTexto(r?.fechaProgramada, 10), // para cuándo queda la corrección
    estado: ESTADOS.has(r?.estado) ? r.estado : "pendiente",
    comentario: limpiarTexto(r?.comentario),
  };
}

export async function GET(req) {
  if (esBuild(req)) return Response.json({ ok: true, revisiones: [] });
  try {
    return Response.json({ ok: true, revisiones: await leerRevisiones() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (esBuild(req)) return Response.json({ ok: false, error: "build" }, { status: 400 });
  try {
    const { accion, revision } = await req.json();
    let revisiones = await leerRevisiones();

    if (accion === "crear") {
      const base = normalizar(revision);
      if (!base.fecha || !base.patente) {
        return Response.json(
          { ok: false, error: "Faltan fecha de revisión y patente" },
          { status: 400 }
        );
      }
      revisiones.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ...base,
        creado: new Date().toISOString(),
      });
    } else if (accion === "editar") {
      const i = revisiones.findIndex((x) => x.id === revision?.id);
      if (i === -1) return Response.json({ ok: false, error: "Revisión no encontrada" }, { status: 404 });
      const r = revisiones[i];
      if (revision.fecha !== undefined) r.fecha = limpiarTexto(revision.fecha, 10) || r.fecha;
      if (revision.patente !== undefined) r.patente = limpiarTexto(revision.patente, 20).toUpperCase() || r.patente;
      if (revision.falla !== undefined) r.falla = limpiarTexto(revision.falla, 300);
      if (revision.accion !== undefined) r.accion = limpiarTexto(revision.accion, 300);
      if (revision.fechaProgramada !== undefined) r.fechaProgramada = limpiarTexto(revision.fechaProgramada, 10);
      if (revision.estado !== undefined && ESTADOS.has(revision.estado)) r.estado = revision.estado;
      if (revision.comentario !== undefined) r.comentario = limpiarTexto(revision.comentario);
    } else if (accion === "borrar") {
      revisiones = revisiones.filter((x) => x.id !== revision?.id);
    } else {
      return Response.json({ ok: false, error: "Acción inválida" }, { status: 400 });
    }

    await guardarRevisiones(revisiones);
    return Response.json({ ok: true, revisiones });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
