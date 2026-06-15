"use client";

import "../globals.css";
import Nav from "../Nav";
import { useEffect, useMemo, useState } from "react";
import Pda from "../flota/Pda";
import datos from "./datos.json";

// Estándar de flota — estratificación del "Listado de cumplimiento de estándar"
// (planilla de Herminio). Datos pre-digeridos en datos.json: % global, % por
// unidad (con sus ítems pendientes) y % por ítem, para camiones y autoelevadores.
// La sucursal de cada unidad sale del padrón de Cloudfleet (/api/estandar-sucursales)
// porque la planilla no trae ese dato.

function colorPct(p) {
  if (p >= 95) return "#16a34a";
  if (p >= 80) return "#d97706";
  return "#dc2626";
}

function hoyArg() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const TIPOS = [
  { key: "camiones", label: "Camiones", emoji: "🚛", foto: "/camion.jpg" },
  { key: "autoelevadores", label: "Autoelevadores", emoji: "🏗️", foto: "/autoelevador.jpg" },
];

// Iguazú aparece con y sin tilde según la ficha; unificar para filtrar.
function normSucursal(s) {
  if (!s) return null;
  const v = String(s).trim();
  if (/^iguaz/i.test(v)) return "Iguazú";
  if (/^eldorado/i.test(v)) return "Eldorado";
  return v;
}

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
  const [sucursal, setSucursal] = useState(""); // "" = todas
  const [sucursales, setSucursales] = useState(null); // patente → sucursal (Cloudfleet)
  const tipo = TIPOS.find((t) => t.key === vista);

  useEffect(() => {
    let activo = true;
    fetch("/api/estandar-sucursales", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (activo && j.ok) setSucursales(j.sucursales || {}); })
      .catch(() => { if (activo) setSucursales({}); });
    return () => { activo = false; };
  }, []);

  const sucursalDe = (patente) => normSucursal(sucursales?.[patente]);

  // Re-estratificar según el filtro de sucursal: unidades visibles, resumen
  // (cumple/total) y los ítems con incumplimiento dentro de esa selección.
  const porTipo = useMemo(() => {
    const r = {};
    for (const t of TIPOS) {
      const base = datos[t.key];
      const unidades = base.unidades.filter(
        (u) => !sucursal || sucursalDe(u.patente) === sucursal
      );
      const visibles = new Set(unidades.map((u) => u.patente));
      const items = base.items
        .map((it) => {
          const aplican = it.aplican.filter((p) => visibles.has(p));
          const noOk = it.noOk.filter((p) => visibles.has(p));
          if (!aplican.length || !noOk.length) return null;
          return {
            ...it,
            aplicanSel: aplican.length,
            noOk,
            pct: Math.round(((aplican.length - noOk.length) / aplican.length) * 1000) / 10,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.pct - b.pct || a.item.localeCompare(b.item));
      const total = unidades.reduce((s, u) => s + u.total, 0);
      const cumple = unidades.reduce((s, u) => s + u.cumple, 0);
      r[t.key] = {
        unidades,
        items,
        total,
        cumple,
        pct: total ? Math.round((cumple / total) * 1000) / 10 : 0,
        itemsOk: base.itemsTotal - items.length,
        itemsTotal: base.itemsTotal,
      };
    }
    return r;
  }, [sucursal, sucursales]);

  const d = porTipo[vista];

  return (
    <main className="wrap">
      <Nav />

      <div className="marco-prueba">

      <h1 className="page-title">Estándar</h1>
      <div className="muted" style={{ marginBottom: "1rem" }}>
        <small>
          Cumplimiento del listado de estándar (planilla del {datos.actualizado.split("-").reverse().join("/")}).
          Solo cuentan los ítems que aplican a cada unidad. Verde ≥95% · ámbar ≥80% · rojo &lt;80%.
        </small>
      </div>

      <div className="filters" style={{ marginBottom: "1rem" }}>
        <div className="field">
          <label>Sucursal</label>
          <select value={sucursal} onChange={(e) => { setSucursal(e.target.value); setAbierta(null); }}>
            <option value="">Todas</option>
            <option value="Eldorado">Eldorado</option>
            <option value="Iguazú">Iguazú</option>
          </select>
        </div>
        {sucursal && sucursales && (
          <div className="muted" style={{ alignSelf: "center" }}>
            <small>
              La sucursal sale de la ficha de cada unidad en Cloudfleet; las unidades sin
              sucursal cargada solo aparecen en «Todas».
            </small>
          </div>
        )}
      </div>

      {/* Resumen por tipo: una tarjeta grande por Camiones y Autoelevadores */}
      <div className="est-resumen">
        {TIPOS.map((t) => {
          const r = porTipo[t.key];
          return (
            <button
              key={t.key}
              className={`est-tarjeta${vista === t.key ? " active" : ""}`}
              onClick={() => { setVista(t.key); setAbierta(null); }}
            >
              <Dona pct={r.pct} />
              <div className="est-tarjeta-info">
                <div className="est-tarjeta-titulo">
                  <img className="est-titulo-foto" src={t.foto} alt={t.label} /> {t.label}
                </div>
                <div className="est-tarjeta-sub">{r.unidades.length} unidades{sucursal ? ` en ${sucursal}` : ""}</div>
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
          <h2>Cumplimiento por unidad — {tipo.label}{sucursal ? ` · ${sucursal}` : ""}</h2>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
          Ordenado de menor a mayor cumplimiento. Tocá una unidad para ver qué le falta.
        </div>
        {d.unidades.length === 0 ? (
          <div className="center muted">Sin unidades de {tipo.label.toLowerCase()} con sucursal {sucursal}.</div>
        ) : (
          <div className="est-lista">
            {d.unidades.map((u) => {
              const abierto = abierta === u.patente;
              const suc = sucursalDe(u.patente);
              return (
                <div key={u.patente} className={`est-unidad${abierto ? " abierta" : ""}`}>
                  <button className="est-fila" onClick={() => setAbierta(abierto ? null : u.patente)}>
                    <span className="est-patente">{tipo.emoji} {u.patente}</span>
                    {suc && <span className="est-chip-patente">{suc}</span>}
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
        )}
      </div>

      {/* Estratificación por ítem: dónde está el incumplimiento */}
      <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
        <div className="chart-head">
          <h2>Ítems con incumplimiento — {tipo.label}{sucursal ? ` · ${sucursal}` : ""}</h2>
        </div>
        {d.items.length === 0 ? (
          <div className="center muted">✅ Todos los ítems del estándar están al 100%.</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
              Los {d.itemsOk} ítems restantes del estándar están al 100%.
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
                        <span className="muted"> ({it.aplicanSel - it.noOk.length}/{it.aplicanSel})</span>
                      </td>
                      <td style={{ whiteSpace: "normal", maxWidth: "340px" }}>
                        {it.noOk.length === it.aplicanSel ? (
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

      {/* Planes de acción del estándar (almacenamiento propio, separado del de Check List) */}
      <Pda
        hoy={hoyArg()}
        ambito="estandar"
        descripcion="Para cerrar las brechas del estándar de flota (ítems NO OK). Independiente del filtro de sucursal: siempre muestra todos los planes."
      />
      </div>
    </main>
  );
}
