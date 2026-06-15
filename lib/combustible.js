// Cargas de combustible de la flota Mercosur Misiones desde Cloudfleet.
// Fuente: GET /fuel-entries/ (50 por página, orden ascendente por `number`,
// SIN filtro por fecha en la API → hay ~290 páginas desde 2021).
//
// Para no recorrer todo en cada visita, se guarda un snapshot acumulado en
// Vercel Blob y en cada refresco solo se leen las páginas nuevas: las páginas
// ya completas (50 ítems) no cambian porque el listado es append-only.
// Mismo patrón versionado del PDA para el Blob (archivo nuevo + del()).
import { put, list, del } from "@vercel/blob";

const BASE = "https://fleet.cloudfleet.com/api/v1";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PREFIJO = "combustible-cache/v2-datos-";
// Páginas máximas por invocación: 110 × ~2,2s ≈ 4 min, entra en maxDuration 300.
const MAX_PAGINAS_POR_VEZ = 110;
// Solo trabajamos el año 2026 (pedido de Herminio): el listado es ascendente
// por número, así que arrancamos en la página donde está fin de 2025 (con
// margen) y descartamos las cargas anteriores al 1/1/2026.
const PAGINA_ANCLA = 256;
const FECHA_DESDE = "2026-01-01";

function apiKey() {
  return process.env.CLOUDFLEET_API_KEY || null;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Rate limit Cloudfleet: 30 req/min POR CUENTA (compartido con checklists y
// otros tableros) → ritmo ~2,2s entre peticiones y retry respetando Retry-After.
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
    if (res.status !== 429 || intento >= 2) {
      await dormir(2200);
      return res;
    }
    const espera = Math.min(Number(res.headers.get("Retry-After")) || 20, 45);
    await dormir(espera * 1000);
  }
}

// `date` viene en UTC; restamos 3h para fecha Argentina (YYYY-MM-DD).
function fechaArg(iso) {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function limpiarPatente(code) {
  return (code || "").toUpperCase().replace(/\s/g, "");
}

function normalizar(e) {
  return {
    numero: e.number,
    patente: limpiarPatente(e.vehicleCode),
    fecha: fechaArg(e.date),
    litros: e.qty ?? 0,
    costo: e.totalCost ?? 0,
    odometro: e.odometer ?? null,
    km: e.distanceTraveled ?? 0, // km recorridos desde la carga anterior
    horimetro: e.hourmeter ?? null,
    horas: e.hourmeterTraveled ?? 0, // horas de uso desde la carga anterior (autoelevadores)
    combustible: e.fuelTypeName || null,
    lleno: e.isFull ?? null,
    chofer: e.driver?.name || null,
    sucursal: e.city?.name || e.costCenter?.name || null,
  };
}

async function leerSnapshot() {
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    if (!blobs.length) return null;
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function guardarSnapshot(snap) {
  try {
    const nuevo = await put(`${PREFIJO}${Date.now()}.json`, JSON.stringify(snap), {
      access: "public",
      addRandomSuffix: false,
    });
    const { blobs } = await list({ prefix: PREFIJO });
    const viejos = blobs.filter((b) => b.url !== nuevo.url).map((b) => b.url);
    if (viejos.length) await del(viejos);
  } catch {}
}

// Trae las cargas: lee el snapshot y solo va a Cloudfleet por las páginas que
// faltan (desde la última página completa). Devuelve { entradas, actualizado,
// parcial } — parcial=true si quedaron páginas por leer (presupuesto agotado);
// en ese caso el cliente vuelve a pedir y la lectura continúa donde quedó.
// Si el snapshot está fresco (ttlMs) y completo, no se toca la API.
export async function getCombustible({ rebuild = false, ttlMs = 6 * 60 * 60 * 1000 } = {}) {
  const key = apiKey();
  const snap = (!rebuild && (await leerSnapshot())) || {
    entradas: [],
    paginasCompletas: PAGINA_ANCLA,
  };
  if (!key) {
    return { entradas: snap.entradas, actualizado: snap.actualizado || null, parcial: false };
  }

  const fresco =
    snap.actualizado && Date.now() - new Date(snap.actualizado).getTime() < ttlMs;
  if (fresco && !snap.parcial) {
    return { entradas: snap.entradas, actualizado: snap.actualizado, parcial: false, cacheado: true };
  }

  const porNumero = new Map(snap.entradas.map((e) => [e.numero, e]));

  // Releemos también la última página completa conocida por si Cloudfleet
  // borró alguna carga y el listado se corrió (dedupe por `numero`).
  let pagina = Math.max(1, snap.paginasCompletas);
  let leidas = 0;
  let parcial = false;
  let huboNuevas = false;

  while (leidas < MAX_PAGINAS_POR_VEZ) {
    const res = await fetchCF(`${BASE}/fuel-entries/?page=${pagina}`, key);
    if (res.status === 404) break;
    if (!res.ok) {
      // Falla (p.ej. rate limit de Cloudfleet): NO perdemos lo que ya teníamos.
      // Devolvemos el snapshot acumulado y marcamos parcial para reintentar
      // luego, en vez de cortar y dejar la pantalla en blanco.
      parcial = true;
      break;
    }
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.items || data.data || [];
    if (!arr.length) break;
    for (const crudo of arr) {
      const e = normalizar(crudo);
      if (!e.fecha || e.fecha < FECHA_DESDE) continue; // solo año 2026
      if (!porNumero.has(e.numero)) huboNuevas = true;
      porNumero.set(e.numero, e); // pisa la versión vieja si la carga se editó
    }
    leidas += 1;
    if (arr.length === 50) {
      snap.paginasCompletas = Math.max(snap.paginasCompletas, pagina);
      const next = res.headers.get("X-NextPage") || res.headers.get("x-nextpage");
      if (!next) break;
      pagina += 1;
      if (leidas >= MAX_PAGINAS_POR_VEZ) parcial = true;
    } else {
      break; // página incompleta = última
    }
  }

  const entradas = [...porNumero.values()].sort((a, b) => a.numero - b.numero);
  const resultado = {
    entradas,
    paginasCompletas: snap.paginasCompletas,
    actualizado: new Date().toISOString(),
    parcial,
  };
  // Se guarda siempre: aunque no haya cargas nuevas, la marca de tiempo
  // renovada hace que el TTL evite re-leer la última página en cada visita.
  await guardarSnapshot(resultado);
  return { entradas, actualizado: resultado.actualizado, parcial };
}
