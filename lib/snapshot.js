// Snapshots JSON en Vercel Blob: guardan la última versión mostrada de una
// vista para abrirla AL INSTANTE (defensa de auditoría) aunque Cloudfleet esté
// lento o caído. Versionado igual que combustible/PDA: cada escritura crea un
// pathname nuevo y borra los anteriores de esa clave, para esquivar el cache del
// CDN de Blob.
import { put, list, del } from "@vercel/blob";
import { after } from "next/server";

// Pathname base de una clave lógica (espacio + clave saneada).
function prefijoDe(espacio, clave) {
  const limpia = String(clave).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${espacio}/${limpia}-`;
}

export async function leerSnap(espacio, clave) {
  try {
    const { blobs } = await list({ prefix: prefijoDe(espacio, clave) });
    if (!blobs.length) return null;
    const ultimo = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function guardarSnap(espacio, clave, datos) {
  try {
    const pre = prefijoDe(espacio, clave);
    const nuevo = await put(`${pre}${Date.now()}.json`, JSON.stringify(datos), {
      access: "public",
      addRandomSuffix: false,
    });
    const { blobs } = await list({ prefix: pre });
    const viejos = blobs.filter((b) => b.url !== nuevo.url).map((b) => b.url);
    if (viejos.length) await del(viejos);
  } catch {}
}

// Última copia guardada de la tarjeta, sea del período que sea (la escrita más
// recientemente). Red de seguridad para no dejar la pantalla en blanco cuando el
// período pedido no tiene copia y la API falla (p.ej. rate limit de Cloudfleet).
export async function leerUltimo(espacio) {
  try {
    const { blobs } = await list({ prefix: `${espacio}/` });
    if (!blobs.length) return null;
    const ultimo = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const res = await fetch(ultimo.url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// INSTANTÁNEO: devuelve la última copia guardada sin pegarle a la API (rápido).
// Si todavía no hay nada guardado para esa clave, trae en vivo por única vez y
// la guarda. El front, en paralelo, pide la versión fresca (ver `refrescar`).
// `construir` es una función async que arma el payload completo.
export async function servirConSnapshot({ espacio, clave, construir }) {
  const snap = await leerSnap(espacio, clave);
  if (snap) return { ...snap, cacheado: true };

  // No hay copia exacta de este período (p.ej. primer día con la clave nueva).
  // Para NO esperar ni dejar la pantalla en blanco, mostramos al instante la
  // última copia disponible (marcada `aproximado`) y armamos la exacta por
  // detrás; el front pide la versión fresca para corregir el período.
  const ultimo = await leerUltimo(espacio);
  if (ultimo) {
    after(async () => {
      try {
        await guardarSnap(espacio, clave, await construir());
      } catch {}
    });
    return { ...ultimo, cacheado: true, aproximado: true };
  }

  // Nunca hubo copia: hay que traer en vivo por única vez.
  const payload = await construir();
  after(async () => {
    try {
      await guardarSnap(espacio, clave, payload);
    } catch {}
  });
  return payload;
}

// FRESCO: trae los datos en vivo de la API, devuelve eso y deja guardada la copia
// (para la próxima apertura instantánea). Es la pata "actualizado". Si la API
// falla, cae a la última copia guardada en vez de cortar.
export async function refrescarSnapshot({ espacio, clave, construir }) {
  try {
    const payload = await construir();
    after(async () => {
      try {
        await guardarSnap(espacio, clave, payload);
      } catch {}
    });
    return payload;
  } catch (e) {
    const fallback = (await leerSnap(espacio, clave)) || (await leerUltimo(espacio));
    if (fallback) return { ...fallback, cacheado: true, aproximado: true };
    throw e;
  }
}
