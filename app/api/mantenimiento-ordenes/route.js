// Órdenes de trabajo de mantenimiento (Cloudfleet) para el dashboard
// de la pestaña Mantenimiento.
//
// El rate limit de Cloudfleet (30 req/min POR CUENTA, compartido con la página
// de checklists y los tableros de la empresa) hace inviable pegarle en cada
// visita → las órdenes se cachean en Vercel Blob por 30 minutos. Si al
// refrescar la API está saturada, se sirve la copia anterior (stale) antes
// que fallar. Mismo patrón versionado del PDA: nunca sobrescribir el mismo
// pathname (el CDN de Blob sirve copia vieja), siempre archivo nuevo + del().
import { put, list, del } from "@vercel/blob";
import { after } from "next/server";
import { getOrdenes } from "../../../lib/ordenes";

export const maxDuration = 300;

const PREFIJO = "ordenes-cache/v3-datos-"; // bump = invalidar caché de versiones anteriores
const TTL_MS = 30 * 60 * 1000;

async function leerCache() {
  try {
    const { blobs } = await list({ prefix: PREFIJO });
    if (!blobs.length) return null;
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const ts = Number(ultimo.pathname.slice(PREFIJO.length).replace(".json", "")) || 0;
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return null;
    return { ts, datos: await res.json() };
  } catch {
    return null;
  }
}

async function guardarCache(datos) {
  try {
    const nuevo = await put(`${PREFIJO}${Date.now()}.json`, JSON.stringify(datos), {
      access: "public",
      addRandomSuffix: false,
    });
    const { blobs } = await list({ prefix: PREFIJO });
    const viejos = blobs.filter((b) => b.url !== nuevo.url).map((b) => b.url);
    if (viejos.length) await del(viejos);
  } catch {}
}

export async function GET(req) {
  if (!req?.url || process.env.NEXT_PHASE === "phase-production-build") {
    return Response.json({ ok: true, ordenes: [] });
  }

  // `?refresh=1` (botón Sincronizar) saltea el caché y trae lo nuevo de Cloudfleet.
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const cache = await leerCache();

  // Apertura normal: servir la copia AL INSTANTE (aunque esté vencida) y, si
  // está vencida, refrescarla por detrás. Así nunca queda "Sincronizando" en
  // blanco esperando a Cloudfleet (que tarda y tiene límite de velocidad).
  if (cache && !force) {
    if (Date.now() - cache.ts >= TTL_MS) {
      after(async () => {
        try {
          const ordenes = await getOrdenes();
          await guardarCache({ ordenes, actualizado: new Date().toISOString() });
        } catch {}
      });
    }
    return Response.json({ ok: true, ...cache.datos, cacheado: true });
  }

  // force=1 (Sincronizar) o sin copia todavía: traer en vivo, con fallback.
  try {
    const ordenes = await getOrdenes();
    const datos = { ordenes, actualizado: new Date().toISOString() };
    await guardarCache(datos);
    return Response.json({ ok: true, ...datos });
  } catch (e) {
    // API saturada o caída: mejor la copia anterior que nada.
    if (cache) {
      return Response.json({ ok: true, ...cache.datos, cacheado: true, stale: true });
    }
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
