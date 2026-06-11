"use client";

import "../globals.css";
import Nav from "../Nav";

// Página Combustible — se alimentará de la API de Cloudfleet (sección combustible).
// Armazón con el mismo formato del resto; filtros y datos se conectan en el próximo paso.
export default function Combustible() {
  return (
    <main className="wrap">
      <Nav />

      <h1 className="page-title">Combustible</h1>

      <div className="soon-card">
        <div className="soon-emoji">⛽</div>
        <h2>Sección en preparación</h2>
        <p>
          Acá vamos a mostrar el <strong>consumo de combustible de la flota</strong> con
          datos tomados de la API de Cloudfleet. Definimos juntos qué filtros e indicadores
          querés (vehículo, sucursal, litros, costo, rendimiento, fechas) y los conectamos.
        </p>
      </div>
    </main>
  );
}
