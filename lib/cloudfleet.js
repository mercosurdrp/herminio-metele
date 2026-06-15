// Cliente Cloudfleet — flota Mercosur Distribuciones Misiones.
// La API exige User-Agent de navegador o Cloudflare devuelve 403 (error 1010).

const BASE = "https://fleet.cloudfleet.com/api/v1";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Patentes de OTRO negocio que NO son de la distribución Misiones — excluir siempre.
const PATENTES_EXCLUIDAS = new Set([
  "HIE914",
  "FTI805",
  "FWN676",
  "AED831",
  "KPI695",
  "KPI-695",
  "AF757XZ",
]);

// Sucursales válidas de la distribución Misiones.
const SUCURSALES_VALIDAS = new Set(["Eldorado", "Iguazú", "Iguazu"]);

// Solo nos interesan estos tipos de checklist.
const TIPOS_VALIDOS = new Set(["LIBERACION", "RETORNO"]);

function apiKey() {
  // No tirar a nivel build/colección de datos: devolvemos null y lo maneja getChecklists.
  return process.env.CLOUDFLEET_API_KEY || null;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Cloudfleet limita a 30 req/min POR CUENTA (compartido con combustible y otros
// tableros). Ante 429 espera y reintenta respetando Retry-After, así un rango
// largo (varias páginas) se baja COMPLETO en vez de cortarse a la mitad.
async function fetchCF(url, key) {
  for (let intento = 0; ; intento++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": BROWSER_UA,
      },
      cache: "no-store",
    });
    if (res.status !== 429 || intento >= 4) return res;
    const espera = Math.min(Number(res.headers.get("Retry-After")) || 20, 45);
    await dormir(espera * 1000);
  }
}

// checklistDate viene en UTC; restar 3h para hora Argentina.
function aHoraArg(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return new Date(d.getTime() - 3 * 60 * 60 * 1000);
}

function fechaArgISO(iso) {
  const d = aHoraArg(iso);
  if (!d) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// El parámetro `checklistDateTo` de la API de Cloudfleet es EXCLUSIVO: el día
// indicado NO se incluye. Para traer hasta `hasta` inclusive (en particular el
// día de hoy) hay que pedir el día siguiente como tope.
function diaSiguiente(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Trae el padrón de vehículos y arma un mapa patente → sucursal. Sirve de
// fallback: algunos checklists vienen sin costCenter/city (p. ej. HJR136), pero
// el vehículo SÍ tiene su sucursal asignada en la ficha.
async function fetchMapaSucursales() {
  const key = apiKey();
  if (!key) return new Map();
  const res = await fetchCF(`${BASE}/vehicles/`, key);
  if (!res.ok) return new Map(); // sin padrón, seguimos solo con lo del check
  const data = await res.json();
  const arr = Array.isArray(data) ? data : data.items || data.data || [];
  const m = new Map();
  for (const v of arr) {
    const code = (v.code || "").toUpperCase().replace(/\s/g, "");
    const suc = v.costCenter?.name || v.city?.name || null;
    if (code && suc) m.set(code, suc);
  }
  return m;
}

// Trae todos los checklists de un rango de fechas, paginando (50 por página).
async function traerChecklistsCrudos(desde, hasta) {
  const key = apiKey();
  if (!key) return []; // sin credencial (p.ej. en build) no llamamos a la API
  const hastaExclusivo = diaSiguiente(hasta); // `checklistDateTo` es exclusivo
  const out = [];
  let page = 1;
  for (;;) {
    const url = `${BASE}/checklist/?checklistDateFrom=${desde}&checklistDateTo=${hastaExclusivo}&page=${page}`;
    const res = await fetchCF(url, key);
    // 404 = "No Checklists found" para el rango: no es un error, es vacío.
    if (res.status === 404) break;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Cloudfleet ${res.status}: ${txt.slice(0, 200)}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 50) break;
    page += 1;
    if (page > 200) break; // tope de seguridad
  }
  return out;
}

// Sucursal efectiva de un checklist: la del check si viene, sino la del padrón
// de vehículos (mapa patente → sucursal).
function sucursalDe(c, mapaSuc) {
  const directa = c.costCenter?.name || c.city?.name || null;
  if (directa) return directa;
  const code = (c.vehicle?.code || "").toUpperCase().replace(/\s/g, "");
  return mapaSuc?.get(code) || null;
}

// Normaliza un checklist crudo de Cloudfleet a la forma que usa la UI.
function normalizar(c, mapaSuc) {
  const stats = c.statistics || {};
  const total = stats.qtyTotalVariables || 0;
  const aprob = stats.qtyVariablesApproved || 0;
  const cumplimiento = total > 0 ? Math.round((aprob / total) * 1000) / 10 : null;
  return {
    numero: c.number,
    patente: c.vehicle?.code || null,
    tipo: c.type?.name || null, // LIBERACION / RETORNO
    estado: c.status?.name || null, // APROBADO / RECHAZADO / CRITICO
    sucursal: sucursalDe(c, mapaSuc),
    // Quien realiza el check es quien lo carga (`createdBy`). El `driver` queda
    // como fallback por si algún check no trae quién lo cargó.
    chofer: c.createdBy?.name || c.driver?.name || null,
    fecha: fechaArgISO(c.checklistDate),
    // UTC crudo; la UI lo pasa a hora Argentina (UTC−3) fija, una sola vez.
    fechaHora: c.checklistDate || null,
    odometro: c.odometer ?? null,
    duracionMin: c.durationInMinutes ?? null,
    variablesTotal: total,
    variablesAprob: aprob,
    variablesRech: stats.qtyVariablesRejected || 0,
    variablesCrit: stats.qtyVariablesCritical || 0,
    cumplimiento, // % de variables aprobadas
    comentario: c.comment || null,
  };
}

function esFlotaMisiones(c, mapaSuc) {
  const patente = (c.vehicle?.code || "").toUpperCase().replace(/\s/g, "");
  if (PATENTES_EXCLUIDAS.has(patente)) return false;
  const suc = sucursalDe(c, mapaSuc) || "";
  // Si tiene sucursal (del check o del padrón), debe ser de Misiones.
  if (suc && !SUCURSALES_VALIDAS.has(suc)) return false;
  return true;
}

// Devuelve los checklists LIBERACION/RETORNO de la flota Misiones en el rango dado.
export async function getChecklists(desde, hasta) {
  const [crudos, mapaSuc] = await Promise.all([
    traerChecklistsCrudos(desde, hasta),
    fetchMapaSucursales(),
  ]);
  return crudos
    .filter((c) => TIPOS_VALIDOS.has(c.type?.name))
    .filter((c) => esFlotaMisiones(c, mapaSuc))
    .map((c) => normalizar(c, mapaSuc))
    .sort((a, b) => (b.fechaHora || "").localeCompare(a.fechaHora || ""));
}

// Padrón patente → sucursal como objeto plano (lo usa la página Estándar para
// el filtro por sucursal; la planilla de estándar no trae ese dato).
export async function getMapaSucursales() {
  const m = await fetchMapaSucursales();
  return Object.fromEntries(m);
}

// Espacio de snapshots de checklists y armado del payload que consume la página.
export const SNAP_CHECKLIST = "checklist-snap/v1";
export const claveRango = (desde, hasta) => `${desde}_${hasta}`;

export async function buildChecklists(desde, hasta) {
  const datos = await getChecklists(desde, hasta);
  return {
    ok: true,
    desde,
    hasta,
    total: datos.length,
    actualizado: new Date().toISOString(),
    datos,
  };
}

export { SUCURSALES_VALIDAS, TIPOS_VALIDOS };
