"use client";

// Red de seguridad: si una pantalla falla al renderizar (lo más común: quedó un
// pedazo de la versión vieja en el navegador tras una actualización), en vez de
// dejar la pantalla EN BLANCO, recargamos sola la página para tomar la versión
// nueva. El guard por tiempo evita un bucle si el error fuera persistente.
import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    try {
      const ultima = Number(sessionStorage.getItem("hw-autoreload-ts") || 0);
      if (Date.now() - ultima > 20000) {
        sessionStorage.setItem("hw-autoreload-ts", String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [error]);

  return (
    <main className="wrap" style={{ padding: "2rem", textAlign: "center" }}>
      <h2 style={{ color: "#e6ecf5" }}>Actualizando la pantalla…</h2>
      <p className="muted" style={{ margin: "0.6rem 0 1.2rem" }}>
        Se está recargando sola para mostrarte la versión más nueva.
      </p>
      <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
        <button className="btn" onClick={() => window.location.reload()}>
          Recargar ahora
        </button>
        <button className="btn btn-ghost" onClick={() => reset()}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
