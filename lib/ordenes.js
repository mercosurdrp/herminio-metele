// Órdenes de trabajo de mantenimiento de la flota Mercosur Misiones desde
// Cloudfleet. Fuente: GET /work-orders/ (50 por página; se sigue el header
// X-NextPage hasta agotar). El listado NO acepta filtro por fecha → se traen
// todas y el filtrado por mes/sucursal/tipo lo hace el cliente.
//
// Cada orden trae `labors` (trabajos, con maintenanceType Preventivo /
// Correctivo / Proactivo / Mejora y costo) y `parts` (repuestos, ligados al
// trabajo por laborId). La API exige User-Agent de navegador (Cloudflare).

const BASE = "https://fleet.cloudfleet.com/api/v1";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Patentes de OTRO negocio — no son de la distribución Misiones, se excluyen.
const PATENTES_EXCLUIDAS = new Set([
  "HIE914",
  "FTI805",
  "FWN676",
  "AED831",
  "KPI695",
  "KPI-695",
  "AF757XZ",
]);

const MAX_PAGINAS = 60; // tope de seguridad (60 × 50 = 3000 órdenes)

function apiKey() {
  return process.env.CLOUDFLEET_API_KEY || null;
}

function headers(key) {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": BROWSER_UA,
  };
}

// workshopDate viene en UTC; restamos 3h para fecha Argentina (YYYY-MM-DD).
function fechaArg(iso) {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function limpiarPatente(code) {
  return (code || "").toUpperCase().replace(/\s/g, "");
}

// Unificar el nombre del tipo de mantenimiento (viene en labor.maintenanceType).
function tipoDe(labor) {
  const n = (labor?.maintenanceType?.name || "").trim().toLowerCase();
  if (n.startsWith("prev")) return "Preventivo";
  if (n.startsWith("corr")) return "Correctivo";
  if (n.startsWith("proa")) return "Proactivo";
  if (n.startsWith("mejor")) return "Mejora";
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "Sin tipo";
}

function normalizarOrden(o, mapaSuc) {
  const patente = limpiarPatente(o.vehicleCode);
  const trabajos = (o.labors || []).map((l) => ({
    id: l.id,
    nombre: l.name || "(sin nombre)",
    tipo: tipoDe(l),
    sistema: l.system?.name || null,
    subsistema: l.subsystem?.name || null,
    cantidad: l.qty ?? 1,
    costo: l.totalCost ?? 0,
    comentario: l.comment || "",
  }));
  const tipoPorLabor = new Map(trabajos.map((t) => [t.id, t.tipo]));
  const repuestos = (o.parts || []).map((p) => ({
    id: p.id,
    nombre: p.name || "(sin nombre)",
    codigo: p.code || null,
    cantidad: p.qty ?? 1,
    costo: p.totalCost ?? 0,
    tipo: tipoPorLabor.get(p.laborId) || "Sin tipo",
    comentario: p.comment || "",
  }));
  // Costo por tipo de mantenimiento = trabajos del tipo + repuestos ligados a ellos.
  const costoPorTipo = {};
  for (const t of trabajos) costoPorTipo[t.tipo] = (costoPorTipo[t.tipo] || 0) + t.costo;
  for (const r of repuestos) costoPorTipo[r.tipo] = (costoPorTipo[r.tipo] || 0) + r.costo;
  return {
    numero: o.number,
    patente,
    fecha: fechaArg(o.workshopDate || o.createdAt),
    estado: o.status || null,
    odometro: o.odometer ?? null,
    taller: o.vendor?.name || null,
    sucursal: o.costCenter?.name || o.city?.name || mapaSuc[patente] || null,
    motivo: o.reason || o.detectedIssue || null,
    comentarios: o.comments || null,
    costoTrabajos: o.totalCostLabors ?? trabajos.reduce((s, t) => s + t.costo, 0),
    costoRepuestos: o.totalCostParts ?? repuestos.reduce((s, r) => s + r.costo, 0),
    costoTotal:
      o.totalCost ??
      (o.totalCostLabors ?? 0) + (o.totalCostParts ?? 0),
    tipos: [...new Set(trabajos.map((t) => t.tipo))],
    costoPorTipo,
    trabajos,
    repuestos,
  };
}

// Padrón patente → sucursal (fallback cuando la orden no trae costCenter).
async function fetchMapaSucursales(key) {
  try {
    const res = await fetch(`${BASE}/vehicles/`, { headers: headers(key), cache: "no-store" });
    if (!res.ok) return {};
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.items || data.data || [];
    const m = {};
    for (const v of arr) {
      const code = limpiarPatente(v.code);
      const suc = v.costCenter?.name || v.city?.name || null;
      if (code && suc) m[code] = suc;
    }
    return m;
  } catch {
    return {};
  }
}

// Año desde el cual buscar órdenes (la flota empezó a cargar en Cloudfleet
// hace poco; ampliar si aparece histórico anterior).
const ANIO_INICIO = 2023;

// Trae TODAS las órdenes de trabajo. El listado EXIGE un rango de fechas
// (startDateFrom/startDateTo, error 409 si falta) y el rango NO puede superar
// 180 días (otro 409) — se pide por ventanas de 179 días, paginando cada una.
export async function getOrdenes() {
  const key = apiKey();
  if (!key) return [];
  const mapaSuc = await fetchMapaSucursales(key);

  // Ventanas [desde, hasta] de 179 días desde ANIO_INICIO hasta hoy.
  const ventanas = [];
  let desde = new Date(Date.UTC(ANIO_INICIO, 0, 1));
  const hoy = new Date();
  while (desde <= hoy) {
    const hasta = new Date(Math.min(desde.getTime() + 179 * 86400000, hoy.getTime() + 86400000));
    ventanas.push([desde.toISOString().slice(0, 19) + "Z", hasta.toISOString().slice(0, 19) + "Z"]);
    desde = new Date(hasta.getTime() + 1000);
  }

  const crudas = [];
  for (const [vDesde, vHasta] of ventanas) {
    let url = `${BASE}/work-orders/?startDateFrom=${vDesde}&startDateTo=${vHasta}`;
    for (let pagina = 0; url && pagina < MAX_PAGINAS; pagina++) {
      const res = await fetch(url, { headers: headers(key), cache: "no-store" });
      if (res.status === 404) break; // ventana sin órdenes
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Cloudfleet work-orders ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      const arr = Array.isArray(data) ? data : data.items || data.data || [];
      crudas.push(...arr);
      if (!arr.length) break;
      const next = res.headers.get("X-NextPage") || res.headers.get("x-nextpage");
      url = next ? next.replace(/^"|"$/g, "") : null;
    }
  }

  // Si el listado viene "liviano" (sin labors/parts), completarlos desde los
  // endpoints globales y unirlos por workOrderNumber.
  if (crudas.length && crudas.every((o) => o.labors === undefined)) {
    const [labors, parts] = await Promise.all([
      fetchListaGlobal(key, "labors"),
      fetchListaGlobal(key, "parts"),
    ]);
    const porOrden = (arr) => {
      const m = new Map();
      for (const x of arr) {
        const n = x.workOrderNumber;
        if (!m.has(n)) m.set(n, []);
        m.get(n).push(x);
      }
      return m;
    };
    const lm = porOrden(labors);
    const pm = porOrden(parts);
    for (const o of crudas) {
      o.labors = lm.get(o.number) || [];
      o.parts = pm.get(o.number) || [];
    }
  }

  return crudas
    .filter((o) => !PATENTES_EXCLUIDAS.has(limpiarPatente(o.vehicleCode)))
    .map((o) => normalizarOrden(o, mapaSuc))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || b.numero - a.numero);
}

// Lista global de trabajos o repuestos de todas las órdenes (paginada).
async function fetchListaGlobal(key, recurso) {
  const todo = [];
  let url = `${BASE}/work-orders/${recurso}/`;
  for (let pagina = 0; url && pagina < MAX_PAGINAS; pagina++) {
    const res = await fetch(url, { headers: headers(key), cache: "no-store" });
    if (!res.ok) break; // best effort: sin esto igual mostramos las órdenes
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.items || data.data || [];
    todo.push(...arr);
    if (!arr.length) break;
    const next = res.headers.get("X-NextPage") || res.headers.get("x-nextpage");
    url = next ? next.replace(/^"|"$/g, "") : null;
  }
  return todo;
}
