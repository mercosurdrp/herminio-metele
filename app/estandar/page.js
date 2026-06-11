"use client";

import "../globals.css";
import Nav from "../Nav";
import { useState } from "react";
import datos from "./datos.json";

// Estándar de flota — estratificación del "Listado de cumplimiento de estándar"
// (planilla de Herminio). Datos pre-digeridos en datos.json: % global, % por
// unidad (con sus ítems pendientes) y % por ítem, para camiones y autoelevadores.

function colorPct(p) {
  if (p >= 95) return "#16a34a";
  if (p >= 80) return "#d97706";
  return "#dc2626";
}

const TIPOS = [
  { key: "camiones", label: "Camiones", emoji: "🚛" },
  { key: "autoelevadores", label: "Autoelevadores", emoji: "🏗️" },
];

function Dona({ pct }) {
  // Anillo de progreso con conic-gradient; el número grande va en el centro.
  const c = colorPct(pct);
  return (
    <div className="est-dona" style={{ background: `conic-gradient(${c} ${pct * 3.6}deg, var(--border) 0deg)` }}>
      <div className="est-dona-centro">
        <span className="est-dona-pct" style={{ color: c }}>{pct}%</span>
      </div>
    </div>
  );
}

export default function Estandar() {
  const [vista, setVista] = useState("camiones");
  const [abierta, setAbierta] = useState(null); // patente con pendientes desplegados
  const d = datos[vista];
  const tipo = TIPOS.find((t) => t.key === vista);

  return (
    <main className="wrap">
      <Nav />

      <h1 className="page-title">Estándar de flota</h1>
      <div className="muted" style={{ marginBottom: "1rem" }}>
        <small>
          Cumplimiento del listado de estándar (planilla del {datos.actualizado.split("-").reverse().join("/")}).
          Solo cuentan los ítems que aplican a cada unidad. Verde ≥95% · ámbar ≥80% · rojo &lt;80%.
        </small>
      </div>

      {/* Resumen por tipo: una tarjeta grande por Camiones y Autoelevadores */}
      <div className="est-resumen">
        {TIPOS.map((t) => {
          const r = datos[t.key];
          return (
            <button
              key={t.key}
              className={`est-tarjeta${vista === t.key ? " active" : ""}`}
              onClick={() => { setVista(t.key); setAbierta(null); }}
            >
              <Dona pct={r.pct} />
              <div className="est-tarjeta-info">
                <div className="est-tarjeta-titulo">{t.emoji} {t.label}</div>
                <div className="est-tarjeta-sub">{r.unidades.length} unidades</div>
                <div className="est-tarjeta-sub">{r.cumple} de {r.total} ítems cumplidos</div>
                <div className="est-tarjeta-sub">
                  {r.itemsOk} de {r.itemsTotal} ítems del estándar al 100%
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Estratificación por unidad */}
      <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
        <div className="chart-head">
          <h2>Cumplimiento por unidad — {tipo.label}</h2>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
          Ordenado de menor a mayor cumplimiento. Tocá una unidad para ver qué le falta.
        </div>
        <div className="est-lista">
          {d.unidades.map((u) => {
            const abierto = abierta === u.patente;
            return (
              <div key={u.patente} className={`est-unidad${abierto ? " abierta" : ""}`}>
                <button className="est-fila" onClick={() => setAbierta(abierto ? null : u.patente)}>
                  <span className="est-patente">{tipo.emoji} {u.patente}</span>
                  <span className="est-barra">
                    <span
                      className="est-barra-relleno"
                      style={{ width: `${u.pct}%`, background: colorPct(u.pct) }}
                    />
                  </span>
                  <span className="est-pct" style={{ color: colorPct(u.pct) }}>{u.pct}%</span>
                  <span className="est-detalle muted">{u.cumple}/{u.total}</span>
                  <span className={`est-flecha${abierto ? " girada" : ""}`}>▾</span>
                </button>
                {abierto && (
                  <div className="est-pendientes">
                    {u.pendientes.length === 0 ? (
                      <div className="est-pend-ok">✅ Cumple todos los ítems que le aplican.</div>
                    ) : (
                      u.pendientes.map((p, i) => (
                        <div className="est-pend" key={i}>
                          <span className="badge bad">NO OK</span>
                          <span className="est-pend-item">{p.item}</span>
                          {p.obs && <span className="est-pend-obs">— {p.obs}</span>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Estratificación por ítem: dónde está el incumplimiento */}
      <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
        <div className="chart-head">
          <h2>Ítems con incumplimiento — {tipo.label}</h2>
        </div>
        {d.items.length === 0 ? (
          <div className="center muted">✅ Todos los ítems del estándar están al 100%.</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
              Los {d.itemsOk} ítems restantes del estándar están al 100% en toda la flota.
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Ítem del estándar</th>
                    <th>Cumplimiento</th>
                    <th>Unidades que no cumplen</th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((it) => (
                    <tr key={it.item}>
                      <td style={{ whiteSpace: "normal", minWidth: "200px", fontWeight: 700 }}>{it.item}</td>
                      <td>
                        <span className="est-pct" style={{ color: colorPct(it.pct) }}>{it.pct}%</span>
                        <span className="muted"> ({it.cumple}/{it.total})</span>
                      </td>
                      <td style={{ whiteSpace: "normal", maxWidth: "340px" }}>
                        {it.noOk.length === it.total ? (
                          <strong>Toda la flota ({it.noOk.length})</strong>
                        ) : (
                          it.noOk.map((p) => (
                            <span className="est-chip-patente" key={p}>{p}</span>
                          ))
                        )}
                      </td>
                      <td style={{ whiteSpace: "normal", minWidth: "200px" }} className="muted">
                        {it.obs || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
