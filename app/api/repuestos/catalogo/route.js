// Catálogo de repuestos del taller (editable desde la página): agregar, editar
// y borrar repuestos. Persiste en Vercel Blob (mismo patrón versionado que los
// PDA y los movimientos). Si está vacío, se siembra con CATALOGO_SEED (la lista
// de la planilla de Herminio).
import { put, list, del } from "@vercel/blob";
import { CATALOGO_SEED } from "../../../repuestos/catalogo";

const PREFIJO = "repuestos-catalogo/cat-";

function nuevoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function limpiarTexto(v, max = 120) {
  return String(v ?? "").trim().slice(0, max);
}
function esBuild(req) {
  return !req?.url || process.env.NEXT_PHASE === "phase-production-build";
}

async function leerBlob() {
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    if (!blobs.length) return null;
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

async function guardar(catalogo) {
  const nuevo = await put(`${PREFIJO}${Date.now()}.json`, JSON.stringify(catalogo), {
    access: "public",
    addRandomSuffix: false,
  });
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    const viejos = blobs.filter((b) => b.url !== nuevo.url).map((b) => b.url);
    if (viejos.length) await del(viejos);
  } catch {}
}

// Devuelve el catálogo, sembrándolo con la planilla la primera vez.
async function leerOSembrar() {
  const existente = await leerBlob();
  if (existente) return existente;
  const seed = CATALOGO_SEED.map((r) => ({ id: nuevoId(), ...r }));
  try {
    await guardar(seed);
  } catch {}
  return seed;
}

export async function GET(req) {
  if (esBuild(req)) {
    return Response.json({ ok: true, catalogo: CATALOGO_SEED.map((r) => ({ id: r.nombre, ...r })) });
  }
  try {
    return Response.json({ ok: true, catalogo: await leerOSembrar() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (esBuild(req)) return Response.json({ ok: false, error: "build" }, { status: 400 });
  try {
    const { accion, item } = await req.json();
    let catalogo = await leerOSembrar();

    if (accion === "crear") {
      const nombre = limpiarTexto(item?.nombre);
      if (!nombre) return Response.json({ ok: false, error: "Falta el nombre del repuesto" }, { status: 400 });
      // Evita duplicados por nombre (sin distinguir mayúsculas).
      const clave = nombre.toUpperCase().replace(/\s+/g, " ");
      if (catalogo.some((c) => (c.nombre || "").toUpperCase().replace(/\s+/g, " ") === clave)) {
        return Response.json({ ok: false, error: "Ese repuesto ya está en la lista" }, { status: 400 });
      }
      catalogo.push({
        id: nuevoId(),
        nombre,
        grupo: limpiarTexto(item?.grupo, 60),
        ubicacion: limpiarTexto(item?.ubicacion, 60),
      });
    } else if (accion === "editar") {
      const i = catalogo.findIndex((c) => c.id === item?.id);
      if (i === -1) return Response.json({ ok: false, error: "Repuesto no encontrado" }, { status: 404 });
      const c = catalogo[i];
      if (item.nombre !== undefined) c.nombre = limpiarTexto(item.nombre) || c.nombre;
      if (item.grupo !== undefined) c.grupo = limpiarTexto(item.grupo, 60);
      if (item.ubicacion !== undefined) c.ubicacion = limpiarTexto(item.ubicacion, 60);
    } else if (accion === "borrar") {
      catalogo = catalogo.filter((c) => c.id !== item?.id);
    } else {
      return Response.json({ ok: false, error: "Acción inválida" }, { status: 400 });
    }

    await guardar(catalogo);
    return Response.json({ ok: true, catalogo });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
