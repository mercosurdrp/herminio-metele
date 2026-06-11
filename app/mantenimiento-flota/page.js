"use client";

import "../globals.css";
import Nav from "../Nav";

// Página Mantenimiento — se alimentará de la API de Cloudfleet (sección mantenimiento).
// Por ahora es el armazón con el mismo formato del resto; los filtros y datos
// se conectan en el próximo paso.
export default function MantenimientoFlota() {
  return (
    <main className="wrap">
      <Nav />

      <h1 className="page-title">Mantenimiento</h1>

      <div className="soon-card">
        <div className="soon-emoji">🛠️</div>
        <h2>Sección en preparación</h2>
        <p>
          Acá vamos a mostrar el <strong>mantenimiento de la flota</strong> con datos
          tomados de la API de Cloudfleet. Definimos juntos qué filtros e indicadores
          querés (vehículo, sucursal, tipo de servicio, fechas, costos) y los conectamos.
        </p>
      </div>
    </main>
  );
}
