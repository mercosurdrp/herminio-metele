"use client";

import "../globals.css";
import Nav from "../Nav";
import { useEffect, useMemo, useState } from "react";
import Pda from "../flota/Pda";
import datos from "./datos.json";

// Estándar de flota — estratificación del "Listado de cumplimiento de estándar"
// (planilla de Herminio). Datos pre-digeridos en datos.json: % global, % por
// unidad (con sus ítems pendientes) y % por ítem, para camiones y autoelevadores.
// El auditor pide cada ALCANCE por separado (Mandatorio / Excelencia): todos los
// porcentajes se muestran de a dos, nunca mezclados.
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

const ALCANCES = [
  { key: "MANDATORIO", label: "Mandatorio", corto: "Mand." },
  { key: "EXCELENCIA", label: "Excelencia", corto: "Exc." },
];

function pctDe(c, t) {
  return t ? Math.round((c / t) * 1000) / 10 : null;
}

function fmt(n) {
  return String(n).replace(".", ",");
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

function Dona({ pct, label }) {
  // Anillo de progreso con conic-gradient; el número grande va en el centro.
  // pct null = ese alcance no tiene ítems para el tipo (ej. Excelencia en AE).
  const c = pct == null ? "var(--muted)" : colorPct(pct);
  return (
    <div className="est-dona-col">
      <div className="est-dona" style={{ background: `conic-gradient(${c} ${(pct || 0) * 3.6}deg, var(--border) 0deg)` }}>
        <div className="est-dona-centro">
          <span className="est-dona-pct" style={{ color: c }}>{pct == null ? "N/A" : `${fmt(pct)}%`}</span>
        </div>
      </div>
      <span className="est-dona-label">{label}</span>
    </div>
  );
}

function Barra({ r, label }) {
  // r = { cumple, total, pct } de un alcance; sin r ⇒ ese alcance no aplica a la unidad.
  if (!r) return <span className="est-alc est-alc-na muted"><span className="est-alc-lbl">{label}</span>no aplica</span>;
  return (
    <span className="est-alc">
      <span className="est-alc-lbl">{label}</span>
      <span className="est-barra">
        <span className="est-barra-relleno" style={{ width: `${r.pct}%`, background: colorPct(r.pct) }} />
      </span>
      <span className="est-pct" style={{ color: colorPct(r.pct) }}>{fmt(r.pct)}%</span>
      <span className="est-detalle muted">{fmt(r.cumple)}/{r.total}</span>
    </span>
  );
}

export default function Estandar() {
  const [vista, setVista] = useState("camiones");
  const [abierta, setAbierta] = useState(null); // patente con pendientes desplegados
  const [sucursal, setSucursal] = useState(""); // "" = todas
  const [alcItems, setAlcItems] = useState(""); // filtro de la tabla de ítems; "" = ambos
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
      const itemsAlc = base.itemsAlcance.map((it) => {
        const aplican = it.aplican.filter((p) => visibles.has(p));
        const noOk = it.noOk.filter((p) => visibles.has(p));
        const parciales = it.parciales.filter((p) => visibles.has(p));
        const cumple = aplican.length - noOk.length + parciales.length * 0.5;
        return { ...it, aplicanSel: aplican.length, noOk, parciales, cumple, pct: pctDe(cumple, aplican.length) };
      }).filter((it) => it.aplicanSel);
      const items = itemsAlc
        .filter((it) => it.noOk.length)
        .sort((a, b) =>
          ALCANCES.findIndex((x) => x.key === a.alcance) - ALCANCES.findIndex((x) => x.key === b.alcance) ||
          a.pct - b.pct || a.item.localeCompare(b.item));
      const alcances = {};
      for (const a of ALCANCES) {
        const total = unidades.reduce((s, u) => s + (u.alcances[a.key]?.total || 0), 0);
        if (!total) continue;
        const cumple = unidades.reduce((s, u) => s + (u.alcances[a.key]?.cumple || 0), 0);
        const deAlc = itemsAlc.filter((it) => it.alcance === a.key);
        alcances[a.key] = {
          total, cumple, pct: pctDe(cumple, total),
          itemsTotal: deAlc.length, itemsOk: deAlc.filter((it) => !it.noOk.length).length,
        };
      }
      r[t.key] = { unidades, items, alcances };
    }
    return r;
  }, [sucursal, sucursales]);

  const d = porTipo[vista];
  const itemsVis = d.items.filter((it) => !alcItems || it.alcance === alcItems);

  return (
    <main className="wrap">
      <Nav />

      <div className="marco-prueba">

      <h1 className="page-title">Estándar</h1>
      <div className="muted" style={{ marginBottom: "1rem" }}>
        <small>
          Cumplimiento del listado de estándar (planilla del {datos.actualizado.split("-").reverse().join("/")}).
          Mandatorio y Excelencia se miden por separado. Solo cuentan los ítems que aplican a cada
          unidad; «parcial» suma medio punto. Verde ≥95% · ámbar ≥80% · rojo &lt;80%.
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
              <div className="est-donas">
                {ALCANCES.map((x) => <Dona key={x.key} pct={r.alcances[x.key]?.pct ?? null} label={x.label} />)}
              </div>
              <div className="est-tarjeta-info">
                <div className="est-tarjeta-titulo">
                  <img className="est-titulo-foto" src={t.foto} alt={t.label} /> {t.label}
                </div>
                <div className="est-tarjeta-sub">{r.unidades.length} unidades{sucursal ? ` en ${sucursal}` : ""}</div>
                {ALCANCES.map((x) => {
                  const v = r.alcances[x.key];
                  return (
                    <div className="est-tarjeta-sub" key={x.key}>
                      <strong>{x.label}:</strong>{" "}
                      {v ? `${fmt(v.cumple)} de ${v.total} cumplidos · ${v.itemsOk} de ${v.itemsTotal} ítems al 100%` : "sin ítems"}
                    </div>
                  );
                })}
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
          Ordenado de menor a mayor cumplimiento mandatorio. Tocá una unidad para ver qué le falta.
        </div>
        {d.unidades.length === 0 ? (
          <div className="center muted">Sin unidades de {tipo.label.toLowerCase()} con sucursal {sucursal}.</div>
        ) : (
          <div className="est-lista">
            <div className="est-fila est-fila-head muted">
              <span className="est-patente">Unidad</span>
              {ALCANCES.map((x) => <span className="est-alc" key={x.key}>{x.label}</span>)}
              <span className="est-flecha" style={{ visibility: "hidden" }}>▾</span>
            </div>
            {d.unidades.map((u) => {
              const abierto = abierta === u.patente;
              const suc = sucursalDe(u.patente);
              return (
                <div key={u.patente} className={`est-unidad${abierto ? " abierta" : ""}`}>
                  <button className="est-fila" onClick={() => setAbierta(abierto ? null : u.patente)}>
                    <span className="est-patente">{tipo.emoji} {u.patente}</span>
                    {suc && <span className="est-chip-patente">{suc}</span>}
                    {ALCANCES.map((x) => <Barra key={x.key} r={u.alcances[x.key]} label={x.corto} />)}
                    <span className={`est-flecha${abierto ? " girada" : ""}`}>▾</span>
                  </button>
                  {abierto && (
                    <div className="est-pendientes">
                      {u.pendientes.length === 0 ? (
                        <div className="est-pend-ok">✅ Cumple todos los ítems que le aplican.</div>
                      ) : (
                        u.pendientes.map((p, i) => (
                          <div className="est-pend" key={i}>
                            <span className={`est-alc-tag ${p.alcance === "EXCELENCIA" ? "exc" : "mand"}`}>
                              {p.alcance === "EXCELENCIA" ? "Excelencia" : "Mandatorio"}
                            </span>
                            <span className={`badge ${p.parcial ? "warn" : "bad"}`}>{p.parcial ? "PARCIAL" : "NO OK"}</span>
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
        <div className="est-filtros">
          {[{ key: "", label: "Ambos" }, ...ALCANCES].map((x) => (
            <button
              key={x.key}
              className={`est-filtro${alcItems === x.key ? " active" : ""}`}
              onClick={() => setAlcItems(x.key)}
            >
              {x.label}
            </button>
          ))}
        </div>
        {itemsVis.length === 0 ? (
          <div className="center muted">✅ Todos los ítems{alcItems ? ` de ${alcItems.toLowerCase()}` : ""} del estándar están al 100%.</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
              {ALCANCES.filter((x) => (!alcItems || alcItems === x.key) && d.alcances[x.key]).map((x) =>
                `${x.label}: ${d.alcances[x.key].itemsOk} de ${d.alcances[x.key].itemsTotal} ítems al 100%`).join(" · ")}
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Ítem del estándar</th>
                    <th>Alcance</th>
                    <th>Cumplimiento</th>
                    <th>Unidades que no cumplen</th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsVis.map((it) => (
                    <tr key={`${it.item}|${it.alcance}`}>
                      <td style={{ whiteSpace: "normal", minWidth: "200px", fontWeight: 700 }}>{it.item}</td>
                      <td>
                        <span className={`est-alc-tag ${it.alcance === "EXCELENCIA" ? "exc" : "mand"}`}>
                          {it.alcance === "EXCELENCIA" ? "Excelencia" : "Mandatorio"}
                        </span>
                      </td>
                      <td>
                        <span className="est-pct" style={{ color: colorPct(it.pct) }}>{fmt(it.pct)}%</span>
                        <span className="muted"> ({fmt(it.cumple)}/{it.aplicanSel})</span>
                      </td>
                      <td style={{ whiteSpace: "normal", maxWidth: "340px" }}>
                        {it.noOk.length === it.aplicanSel ? (
                          <strong>Toda la flota ({it.noOk.length})</strong>
                        ) : (
                          it.noOk.map((p) => (
                            <span className="est-chip-patente" key={p}>
                              {p}{it.parciales.includes(p) ? " (parcial)" : ""}
                            </span>
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
