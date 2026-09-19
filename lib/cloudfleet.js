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

// Autoelevadores de la distribución Misiones. El check del autoelevador es
// PREOPERACIONAL AE y es ÚNICO (no tiene retorno como el camión).
// 🚨 El mismo tipo de check lo usan máquinas de OTRO negocio (HELI1, HELI2 y un
// "TOYOTA" a secas, de Ramallo): por eso el filtro va por patente, no por tipo.
const TIPO_AE = "PREOPERACIONAL AE";
const UNIDADES_AE = new Set(["TOYOTA4", "TOYOTA5", "TOYOTA6"]);

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
// El padrón viene de a 50 por página: hay que seguir X-NextPage hasta agotarlo
// (con una sola página los últimos vehículos quedaban sin sucursal).
async function fetchMapaSucursales() {
  const key = apiKey();
  if (!key) return new Map();
  const m = new Map();
  let url = `${BASE}/vehicles/`;
  for (let pagina = 0; url && pagina < 20; pagina++) {
    const res = await fetchCF(url, key);
    if (!res.ok) break; // sin padrón (o incompleto), seguimos con lo que haya
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.items || data.data || [];
    if (!arr.length) break;
    for (const v of arr) {
      const code = (v.code || "").toUpperCase().replace(/\s/g, "");
      const suc = v.costCenter?.name || v.city?.name || null;
      if (code && suc) m.set(code, suc);
    }
    const next = res.headers.get("X-NextPage") || res.headers.get("x-nextpage");
    url = next ? next.replace(/^"|"$/g, "") : null;
  }
  return m;
}

// Trae todos los checklists de un rango de fechas, paginando (50 por página).
// 🚨 Cloudfleet filtra por `checklistDate` en UTC y nosotros mostramos la fecha
// en hora Argentina (UTC−3): un check de las 21:00 ARG del día `hasta` ya es el
// día siguiente en UTC y se perdía, mientras que uno de las 21:00 ARG del día
// anterior a `desde` se colaba. Por eso pedimos UN DÍA MÁS de margen y después
// recortamos por fecha argentina en `getChecklists`.
async function traerChecklistsCrudos(desde, hasta) {
  const key = apiKey();
  if (!key) return []; // sin credencial (p.ej. en build) no llamamos a la API
  // `checklistDateTo` es exclusivo + 1 día de margen por el desfase UTC→ARG.
  const hastaExclusivo = diaSiguiente(diaSiguiente(hasta));
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
  const esAE = c.type?.name === TIPO_AE;
  return {
    numero: c.number,
    patente: c.vehicle?.code || null,
    tipo: c.type?.name || null, // LIBERACION / RETORNO / PREOPERACIONAL AE
    // Grupo de unidad, para poder separar camiones de autoelevadores en la UI.
    grupo: esAE ? "AUTOELEVADOR" : "CAMION",
    // El autoelevador mide HORÓMETRO donde el camión mide odómetro.
    horometro: c.hourmeter ?? null,
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
  // El autoelevador se admite SOLO si es uno de los tres de Misiones (los AE de
  // Ramallo comparten el tipo de check y algunos vienen sin sucursal).
  if (c.type?.name === TIPO_AE) return UNIDADES_AE.has(patente);
  const suc = sucursalDe(c, mapaSuc) || "";
  // Si tiene sucursal (del check o del padrón), debe ser de Misiones.
  if (suc && !SUCURSALES_VALIDAS.has(suc)) return false;
  return true;
}

// Devuelve los checklists de la flota Misiones en el rango dado.
// Por defecto SOLO camiones (LIBERACION/RETORNO), igual que siempre. Con
// `incluirAE` suma los PREOPERACIONAL AE de TOYOTA4/5/6.
export async function getChecklists(desde, hasta, { incluirAE = false } = {}) {
  const [crudos, mapaSuc] = await Promise.all([
    traerChecklistsCrudos(desde, hasta),
    fetchMapaSucursales(),
  ]);
  return crudos
    .filter((c) =>
      TIPOS_VALIDOS.has(c.type?.name) || (incluirAE && c.type?.name === TIPO_AE)
    )
    // Checks ANULADOS en Cloud Fleet: la API los sigue devolviendo con la marca
    // `voided` (quién/cuándo/motivo) — no deben contar en ningún tablero.
    .filter((c) => !c.voided)
    .filter((c) => esFlotaMisiones(c, mapaSuc))
    .map((c) => normalizar(c, mapaSuc))
    // Recorte final POR FECHA ARGENTINA: lo que se muestra pertenece al período
    // pedido, ni un día de más (el margen UTC de arriba) ni uno de menos.
    .filter((c) => c.fecha && c.fecha >= desde && c.fecha <= hasta)
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
// Clave propia para el payload que incluye autoelevadores: así la copia guardada
// con AE no pisa la de camiones (ni al revés) y cada vista abre lo suyo.
export const claveRangoAE = (desde, hasta) => `${desde}_${hasta}_ae`;

export async function buildChecklists(desde, hasta, { incluirAE = false } = {}) {
  const datos = await getChecklists(desde, hasta, { incluirAE });
  return {
    ok: true,
    desde,
    hasta,
    total: datos.length,
    actualizado: new Date().toISOString(),
    datos,
  };
}

export { SUCURSALES_VALIDAS, TIPOS_VALIDOS, TIPO_AE, UNIDADES_AE };
