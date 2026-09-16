// Órdenes de compra corporativas: alta, edición y seguimiento de
// estado. Persisten como un JSON en Vercel Blob (no hay base de datos), igual
// que los planes de acción (/api/pda) y las revisiones de techo (/api/techos).
//
// 🚨 NO sobrescribir un mismo pathname: el CDN de Blob sirve la copia vieja un
// rato. Cada guardado escribe `ordenes-compra/ocs-<ts>.json` (URL nueva = sin
// caché) y borra las versiones anteriores; se lee el de timestamp más alto.
//
// 🔢 La numeración es AUTOMÁTICA y correlativa por año: OC-AAAA-0000. El
// número lo asigna el servidor al crear (nunca el cliente) mirando el máximo
// del año; así no hay saltos ni repetidos aunque se cargue desde dos equipos.
import { put, list, del } from "@vercel/blob";

const PREFIJO = "ordenes-compra/ocs-";
const PREFIJO_NUMERO = "OC";

export const ESTADOS = [
  "emitida",
  "aprobada",
  "enviada",
  "recibida_parcial",
  "recibida",
  "facturada",
  "anulada",
];
const SET_ESTADOS = new Set(ESTADOS);

async function leerOrdenes() {
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    if (!blobs.length) return [];
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return []; // todavía no hay órdenes guardadas (primer uso)
  }
}

async function guardarOrdenes(ordenes) {
  const nuevo = await put(`${PREFIJO}${Date.now()}.json`, JSON.stringify(ordenes), {
    access: "public",
    addRandomSuffix: false,
  });
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    const viejos = blobs.filter((b) => b.url !== nuevo.url).map((b) => b.url);
    if (viejos.length) await del(viejos);
  } catch {}
}

function texto(v, max = 200) {
  return String(v ?? "").trim().slice(0, max);
}
function numero(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function hoyArg() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Siguiente número correlativo del año (el año sale de la fecha de emisión).
export function proximoNumero(ordenes, fecha) {
  const anio = (fecha || hoyArg()).slice(0, 4);
  const pref = `${PREFIJO_NUMERO}-${anio}-`;
  let max = 0;
  for (const o of ordenes) {
    if (typeof o?.numero === "string" && o.numero.startsWith(pref)) {
      const n = parseInt(o.numero.slice(pref.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${pref}${String(max + 1).padStart(4, "0")}`;
}

function normalizarItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      codigo: texto(it?.codigo, 40),
      descripcion: texto(it?.descripcion, 300),
      umedida: texto(it?.umedida, 20),
      cantidad: numero(it?.cantidad),
      precio: numero(it?.precio),
    }))
    .filter((it) => it.descripcion || it.codigo || it.cantidad || it.precio)
    .slice(0, 40);
}

// Totales calculados SIEMPRE en el servidor: lo que muestra la pantalla y lo
// que queda guardado no pueden diferir.
export function calcularTotales(orden) {
  const neto = (orden.items || []).reduce(
    (a, it) => a + Math.round(it.cantidad * it.precio * 100) / 100,
    0
  );
  const subtotal = Math.round(neto * 100) / 100;
  const flete = numero(orden.fleteOtros);
  const iva = Math.round((subtotal + flete) * numero(orden.ivaPct) * 100) / 100;
  return { subtotal, flete, iva, total: Math.round((subtotal + flete + iva) * 100) / 100 };
}

function normalizar(o) {
  const base = {
    fecha: texto(o?.fecha, 10) || hoyArg(),
    sucursal: texto(o?.sucursal, 40),
    solicitante: texto(o?.solicitante, 80),
    sector: texto(o?.sector, 40),
    prioridad: texto(o?.prioridad, 30) || "Normal",
    rubro: texto(o?.rubro, 60),
    destino: texto(o?.destino, 80), // a qué sector / centro de costo se imputa
    motivo: texto(o?.motivo, 200),
    // Proveedor
    prov: texto(o?.prov, 120),
    cuit: texto(o?.cuit, 20),
    ivaProv: texto(o?.ivaProv, 40),
    dom: texto(o?.dom, 120),
    loc: texto(o?.loc, 80),
    tel: texto(o?.tel, 40),
    contacto: texto(o?.contacto, 80),
    email: texto(o?.email, 120),
    pago: texto(o?.pago, 40),
    // Entrega
    lugar: texto(o?.lugar, 160),
    requerida: texto(o?.requerida, 10),
    plazo: texto(o?.plazo, 60),
    presupuesto: texto(o?.presupuesto, 80),
    moneda: texto(o?.moneda, 10) || "ARS",
    flete: texto(o?.flete, 80),
    // Detalle
    items: normalizarItems(o?.items),
    ivaPct: Math.min(numero(o?.ivaPct ?? 0.21), 1),
    fleteOtros: numero(o?.fleteOtros),
    obs: texto(o?.obs, 1000),
    // Seguimiento
    estado: SET_ESTADOS.has(o?.estado) ? o.estado : "emitida",
    remito: texto(o?.remito, 40),
    factura: texto(o?.factura, 40),
  };
  return { ...base, totales: calcularTotales(base) };
}

function esBuild(req) {
  return !req?.url || process.env.NEXT_PHASE === "phase-production-build";
}

export async function GET(req) {
  if (esBuild(req)) return Response.json({ ok: true, ordenes: [], proximo: "" });
  try {
    const ordenes = await leerOrdenes();
    return Response.json({ ok: true, ordenes, proximo: proximoNumero(ordenes, hoyArg()) });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (esBuild(req)) return Response.json({ ok: false, error: "build" }, { status: 400 });
  try {
    const { accion, orden } = await req.json();
    let ordenes = await leerOrdenes();

    if (accion === "crear") {
      const base = normalizar(orden);
      if (!base.prov) {
        return Response.json({ ok: false, error: "Falta la razón social del proveedor" }, { status: 400 });
      }
      if (!base.items.length) {
        return Response.json({ ok: false, error: "Cargá al menos un ítem" }, { status: 400 });
      }
      ordenes.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        numero: proximoNumero(ordenes, base.fecha), // 🔢 correlativo, lo pone el servidor
        ...base,
        creado: new Date().toISOString(),
      });
    } else if (accion === "editar") {
      const i = ordenes.findIndex((x) => x.id === orden?.id);
      if (i === -1) return Response.json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
      // El número y la fecha de alta NO se tocan: la orden ya circuló con ese número.
      const { id, numero, creado } = ordenes[i];
      ordenes[i] = { id, numero, creado, ...normalizar({ ...ordenes[i], ...orden }) };
    } else if (accion === "estado") {
      const i = ordenes.findIndex((x) => x.id === orden?.id);
      if (i === -1) return Response.json({ ok: false, error: "Orden no encontrada" }, { status: 404 });
      if (SET_ESTADOS.has(orden?.estado)) ordenes[i].estado = orden.estado;
      if (orden?.remito !== undefined) ordenes[i].remito = texto(orden.remito, 40);
      if (orden?.factura !== undefined) ordenes[i].factura = texto(orden.factura, 40);
    } else if (accion === "borrar") {
      ordenes = ordenes.filter((x) => x.id !== orden?.id);
    } else {
      return Response.json({ ok: false, error: "Acción inválida" }, { status: 400 });
    }

    await guardarOrdenes(ordenes);
    return Response.json({ ok: true, ordenes, proximo: proximoNumero(ordenes, hoyArg()) });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
