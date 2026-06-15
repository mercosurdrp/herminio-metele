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

// INSTANTÁNEO: devuelve la última copia guardada sin pegarle a la API (rápido).
// Si todavía no hay nada guardado para esa clave, trae en vivo por única vez y
// la guarda. El front, en paralelo, pide la versión fresca (ver `refrescar`).
// `construir` es una función async que arma el payload completo.
export async function servirConSnapshot({ espacio, clave, construir }) {
  const snap = await leerSnap(espacio, clave);
  if (snap) return { ...snap, cacheado: true };
  const payload = await construir();
  after(async () => {
    try {
      await guardarSnap(espacio, clave, payload);
    } catch {}
  });
  return payload;
}

// FRESCO: trae los datos en vivo de la API, devuelve eso y deja guardada la copia
// (para la próxima apertura instantánea). Es la pata "actualizado".
export async function refrescarSnapshot({ espacio, clave, construir }) {
  const payload = await construir();
  after(async () => {
    try {
      await guardarSnap(espacio, clave, payload);
    } catch {}
  });
  return payload;
}
