"use client";

// Igual que error.js pero a nivel raíz (cubre fallas del layout). Recarga sola
// la página para tomar la versión nueva en vez de quedar en blanco.
import { useEffect } from "react";

export default function GlobalError({ error }) {
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
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#10151f", color: "#e6ecf5", textAlign: "center", padding: "2rem" }}>
        <h2>Actualizando la pantalla…</h2>
        <p style={{ color: "#9fb0c7" }}>Se está recargando sola para mostrarte la versión más nueva.</p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: "#2563eb", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}
        >
          Recargar ahora
        </button>
      </body>
    </html>
  );
}
