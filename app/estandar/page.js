"use client";

import "../globals.css";
import Nav from "../Nav";

// Página Estándar — se alimentará de la API de Cloudfleet.
// Armazón con el mismo formato del resto; filtros y datos se conectan en el próximo paso.
export default function Estandar() {
  return (
    <main className="wrap">
      <Nav />

      <h1 className="page-title">Estándar</h1>

      <div className="soon-card">
        <div className="soon-emoji">📐</div>
        <h2>Sección en preparación</h2>
        <p>
          Acá vamos a mostrar la sección <strong>Estándar</strong> con datos tomados de la
          API de Cloudfleet. Contame qué querés medir y con qué filtros, y lo armamos.
        </p>
      </div>
    </main>
  );
}
