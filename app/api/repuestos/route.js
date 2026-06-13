// Gestión de repuestos del taller: ingresos, salidas y saldo de stock.
// Persiste como un JSON de MOVIMIENTOS en Vercel Blob (no hay base de datos).
// El saldo de stock por repuesto se calcula en el front (Σ ingresos − Σ salidas).
// 🚨 Mismo cuidado que los PDA: NO sobrescribir un pathname (el CDN sirve la
// copia vieja). Cada guardado escribe `repuestos/mov-<ts>.json` nuevo, borra
// las versiones anteriores y se lee el de timestamp más alto vía list().
import { put, list, del } from "@vercel/blob";

const PREFIJO = "repuestos/mov-";
const TIPOS = new Set(["ingreso", "salida"]);

async function leerMovimientos() {
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    if (!blobs.length) return [];
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return []; // todavía no hay movimientos (primer uso)
  }
}

async function guardarMovimientos(movs) {
  const nuevo = await put(`${PREFIJO}${Date.now()}.json`, JSON.stringify(movs), {
    access: "public",
    addRandomSuffix: false,
  });
  // Limpieza de versiones anteriores (best effort).
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    const viejos = blobs.filter((b) => b.url !== nuevo.url).map((b) => b.url);
    if (viejos.length) await del(viejos);
  } catch {}
}

function limpiarTexto(v, max = 200) {
  return String(v ?? "").trim().slice(0, max);
}
function aCantidad(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
// Precio unitario: ≥0 o null si no se cargó.
function aPrecio(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
function esBuild(req) {
  return !req?.url || process.env.NEXT_PHASE === "phase-production-build";
}

export async function GET(req) {
  if (esBuild(req)) return Response.json({ ok: true, movimientos: [] });
  try {
    return Response.json({ ok: true, movimientos: await leerMovimientos() });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (esBuild(req)) return Response.json({ ok: false, error: "build" }, { status: 400 });
  try {
    const { accion, mov } = await req.json();
    let movs = await leerMovimientos();

    if (accion === "crear") {
      const cantidad = aCantidad(mov?.cantidad);
      const nuevo = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        tipo: TIPOS.has(mov?.tipo) ? mov.tipo : "ingreso",
        repuesto: limpiarTexto(mov?.repuesto, 120),
        cantidad,
        precio: aPrecio(mov?.precio), // precio unitario ($); costo = cantidad × precio
        sucursal: limpiarTexto(mov?.sucursal, 40),
        fecha: limpiarTexto(mov?.fecha, 10),
        // Origen (proveedor/remito en ingresos) o destino (vehículo/orden en salidas).
        ref: limpiarTexto(mov?.ref, 120),
        comentario: limpiarTexto(mov?.comentario, 300),
        creado: new Date().toISOString(),
      };
      if (!nuevo.repuesto || !nuevo.cantidad || !nuevo.fecha) {
        return Response.json(
          { ok: false, error: "Faltan repuesto, cantidad (mayor a 0) o fecha" },
          { status: 400 }
        );
      }
      movs.push(nuevo);
    } else if (accion === "editar") {
      const i = movs.findIndex((m) => m.id === mov?.id);
      if (i === -1) return Response.json({ ok: false, error: "Movimiento no encontrado" }, { status: 404 });
      const m = movs[i];
      if (mov.tipo !== undefined && TIPOS.has(mov.tipo)) m.tipo = mov.tipo;
      if (mov.repuesto !== undefined) m.repuesto = limpiarTexto(mov.repuesto, 120) || m.repuesto;
      if (mov.cantidad !== undefined) m.cantidad = aCantidad(mov.cantidad) || m.cantidad;
      if (mov.precio !== undefined) m.precio = aPrecio(mov.precio);
      if (mov.sucursal !== undefined) m.sucursal = limpiarTexto(mov.sucursal, 40);
      if (mov.fecha !== undefined) m.fecha = limpiarTexto(mov.fecha, 10) || m.fecha;
      if (mov.ref !== undefined) m.ref = limpiarTexto(mov.ref, 120);
      if (mov.comentario !== undefined) m.comentario = limpiarTexto(mov.comentario, 300);
    } else if (accion === "borrar") {
      movs = movs.filter((m) => m.id !== mov?.id);
    } else {
      return Response.json({ ok: false, error: "Acción inválida" }, { status: 400 });
    }

    await guardarMovimientos(movs);
    return Response.json({ ok: true, movimientos: movs });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
