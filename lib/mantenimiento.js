// Indicadores de mantenimiento de la flota Mercosur Misiones desde Cloudfleet.
// Fuente: GET /maintenace-time (sí, "maintenace" sin la 2da n, así lo expone la
// API). Devuelve por vehículo: qtyFailure, totalOdometer, hoursInMaintenance
// (downtime), mtbf (km/falla), mttrHrs (h/falla). inherentAvailability viene
// siempre null → la calculamos.
//
// La API exige User-Agent de navegador (Cloudflare) y el rango NO puede superar
// 365 días.

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

const SUCURSALES_VALIDAS = new Set(["Eldorado", "Iguazú", "Iguazu"]);

// Patentes camioneta (resto de utilitarios). El usuario las definió por patente.
const CAMIONETAS = new Set(["JJT427", "JJT-428", "JJT428", "AF199RF", "AF299RF"]);

// Categoría del vehículo según su patente.
function categoriaDe(code) {
  const c = (code || "").toUpperCase().replace(/\s/g, "");
  if (c.startsWith("TOYOTA")) return "Autoelevadores";
  if (CAMIONETAS.has(c)) return "Camionetas";
  return "Camiones";
}

// Se eliminan acoplados/térmico por terminación de patente (UX/JC/XY): no son
// unidades motrices de la flota.
function terminacionExcluida(code) {
  const c = (code || "").toUpperCase().replace(/\s/g, "");
  return c.endsWith("UX") || c.endsWith("JC") || c.endsWith("XY");
}

function apiKey() {
  return process.env.CLOUDFLEET_API_KEY || null;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Reintenta ante el límite de 30 req/min de Cloudfleet (compartido con las otras
// tarjetas), respetando Retry-After, para no fallar por rate limit.
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

// Cantidad de días del rango [desde, hasta] inclusive.
function diasDelRango(desde, hasta) {
  const a = new Date(desde + "T00:00:00Z").getTime();
  const b = new Date(hasta + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

// Trae el crudo de /maintenace-time para todo el universo de vehículos.
async function traerMantenimientoCrudo(desde, hasta) {
  const key = apiKey();
  if (!key) return [];
  const url =
    `${BASE}/maintenace-time?dateFrom=${desde}&dateTo=${hasta}` +
    `&vehicleMeasureUnit=distance`;
  const res = await fetchCF(url, key);
  if (res.status === 404) return [];
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Cloudfleet maintenace-time ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.items || data.data || [];
}

function esFlotaMisiones(v) {
  const code = (v.code || "").toUpperCase().replace(/\s/g, "");
  if (PATENTES_EXCLUIDAS.has(code)) return false;
  if (terminacionExcluida(v.code)) return false; // acoplados / térmico (UX/JC/XY)
  const suc = v.costCenter?.name || v.city?.name || "";
  return SUCURSALES_VALIDAS.has(suc);
}

// Disponibilidad inherente = MTBF / (MTBF + MTTR), ambos en horas.
function disponibilidad(mtbfHoras, mttr) {
  if (mtbfHoras == null) return 100; // sin fallas → 100% disponible
  const den = mtbfHoras + mttr;
  if (den <= 0) return 100;
  return (mtbfHoras / den) * 100;
}

function normalizar(v, horasCalendario) {
  const fallas = v.qtyFailure || 0;
  const downtime = v.hoursInMaintenance || 0;
  const mttr = v.mttrHrs || 0; // horas por reparación
  // MTBF en horas: tiempo operativo (calendario − taller) entre fallas.
  const uptime = Math.max(0, horasCalendario - downtime);
  const mtbfHoras = fallas > 0 ? uptime / fallas : null;
  return {
    patente: v.code || null,
    tipo: v.typeName || null,
    categoria: categoriaDe(v.code),
    marca: v.brandName || null,
    linea: v.lineName || null,
    sucursal: v.costCenter?.name || v.city?.name || null,
    fallas,
    odometro: v.totalOdometer || 0,
    downtime, // horas en mantenimiento
    mtbf: v.mtbf || 0, // km por falla (de la API)
    mtbfHoras, // horas entre fallas (null si no hubo fallas)
    mtbfDias: mtbfHoras != null ? mtbfHoras / 24 : null,
    mttr,
    disponibilidad: disponibilidad(mtbfHoras, mttr),
  };
}

/**
 * Devuelve los indicadores de mantenimiento de la flota Misiones en [desde, hasta]:
 * por vehículo + agregados de flota. Rango máximo 365 días.
 */
export async function getMantenimiento(desde, hasta) {
  const dias = diasDelRango(desde, hasta);
  const horasCalendario = dias * 24;

  const crudos = await traerMantenimientoCrudo(desde, hasta);
  const vehiculos = crudos
    .filter(esFlotaMisiones)
    .map((v) => normalizar(v, horasCalendario))
    .sort((a, b) => b.fallas - a.fallas);

  // Agregados de flota.
  const n = vehiculos.length;
  const totalFallas = vehiculos.reduce((s, v) => s + v.fallas, 0);
  const totalOdo = vehiculos.reduce((s, v) => s + v.odometro, 0);
  const totalDowntime = vehiculos.reduce((s, v) => s + v.downtime, 0);
  const baseFlota = n * horasCalendario; // horas-vehículo calendario
  const uptimeFlota = Math.max(0, baseFlota - totalDowntime);
  const mtbfHorasFlota = totalFallas ? uptimeFlota / totalFallas : null;
  const mttrFlota = totalFallas ? totalDowntime / totalFallas : 0;

  const flota = {
    vehiculos: n,
    conFallas: vehiculos.filter((v) => v.fallas > 0).length,
    totalFallas,
    totalDowntime, // horas
    mtbf: totalFallas ? totalOdo / totalFallas : 0, // km/falla
    mtbfHoras: mtbfHorasFlota, // h/falla
    mtbfDias: mtbfHorasFlota != null ? mtbfHorasFlota / 24 : null,
    mttr: mttrFlota, // h/falla
    disponibilidad: disponibilidad(mtbfHorasFlota, mttrFlota),
  };

  return { desde, hasta, dias, flota, vehiculos };
}

// Espacio de snapshots de mantenimiento y armado del payload de la página.
export const SNAP_MANTENIMIENTO = "mantenimiento-snap/v1";

export async function buildMantenimiento(desde, hasta) {
  const data = await getMantenimiento(desde, hasta);
  return { ok: true, actualizado: new Date().toISOString(), ...data };
}
