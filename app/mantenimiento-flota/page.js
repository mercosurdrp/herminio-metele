"use client";

import "../globals.css";
import Nav from "../Nav";
import { useCallback, useEffect, useMemo, useState } from "react";

// Mantenimiento de flota — dashboard de órdenes de trabajo de Cloudfleet:
// costos por tipo (Preventivo / Correctivo / Proactivo / Mejora), filtros por
// sucursal / mes / tipo, y lista desplegable de órdenes con trabajos y repuestos.

// Flota vigente para la auditoría de gestión de mantenimiento — fuente:
// /root/HERMINIO/FLOTA ACTUALIZADA/FLOTA QUILMES ACTUALIZADA AL 31-05-2026.xlsx.
// Solo estas patentes se muestran acá; el resto de las órdenes de Cloudfleet
// sigue disponible para la gestión general (no se filtra en la API).
const PATENTES_AUDITORIA = new Set([
  "OJA408",
  "FUB570",
  "AF399KW",
  "HJR136",
  "OTY696",
  "FTI792",
  "OTB032",
  "AB386KV",
  "AB386KU",
  "AE445WS",
  "AE445WT",
  "AE591EV",
  "AE523XP",
  "AF399KX",
  "AF552QZ",
  "AF399KZ",
]);

const TIPOS = [
  { key: "Preventivo", color: "#16a34a" },
  { key: "Correctivo", color: "#dc2626" },
  { key: "Proactivo", color: "#3b82f6" },
  { key: "Mejora", color: "#a855f7" },
];
const COLOR_OTRO = "#64748b";

function colorTipo(tipo) {
  return TIPOS.find((t) => t.key === tipo)?.color || COLOR_OTRO;
}

const fmtPlata = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

// Montos cortos para arriba de las columnas ($1,2M / $850K).
function fmtCorto(n) {
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function fmtFecha(iso) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function etiquetaMes(ym) {
  const [a, m] = ym.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

function normSucursal(s) {
  if (!s) return null;
  if (/^iguaz/i.test(s)) return "Iguazú";
  if (/^eldorado/i.test(s)) return "Eldorado";
  return s;
}

function BadgeTipo({ tipo }) {
  const c = colorTipo(tipo);
  return (
    <span className="mant-badge" style={{ background: `${c}22`, color: c }}>
      {tipo}
    </span>
  );
}

export default function MantenimientoFlota() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [sucursal, setSucursal] = useState("");
  const [mes, setMes] = useState("");
  const [tipo, setTipo] = useState("");
  const [abierta, setAbierta] = useState(null); // nº de orden desplegada
  const [tipCol, setTipCol] = useState(null); // tooltip del gráfico de columnas

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    return fetch("/api/mantenimiento-ordenes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "Error al leer las órdenes");
        setData(j);
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const ordenes = useMemo(
    () => (data?.ordenes || []).filter((o) => PATENTES_AUDITORIA.has(o.patente)),
    [data]
  );

  // Meses disponibles (del más nuevo al más viejo) para el desplegable.
  const meses = useMemo(
    () => [...new Set(ordenes.map((o) => (o.fecha || "").slice(0, 7)).filter(Boolean))].sort().reverse(),
    [ordenes]
  );

  // Órdenes según sucursal + mes (el tipo se aplica después, así las tarjetas
  // de costo por tipo siempre comparan los 4 tipos dentro del período elegido).
  const base = useMemo(
    () =>
      ordenes.filter(
        (o) =>
          (!sucursal || normSucursal(o.sucursal) === sucursal) &&
          (!mes || (o.fecha || "").startsWith(mes))
      ),
    [ordenes, sucursal, mes]
  );

  const resumen = useMemo(() => {
    const costos = {};
    let total = 0;
    for (const o of base) {
      for (const [t, c] of Object.entries(o.costoPorTipo || {})) {
        costos[t] = (costos[t] || 0) + c;
      }
      total += o.costoTotal || 0;
    }
    return { costos, total };
  }, [base]);

  const filtradas = useMemo(
    () => (tipo ? base.filter((o) => o.tipos.includes(tipo)) : base),
    [base, tipo]
  );

  // Serie del gráfico de columnas: costo por tipo agrupado por mes (o por día
  // cuando hay un mes elegido). Respeta los filtros de sucursal/mes/tipo.
  const serieCol = useMemo(() => {
    const porDia = Boolean(mes);
    const m = new Map();
    for (const o of base) {
      if (!o.fecha) continue;
      const clave = porDia ? o.fecha : o.fecha.slice(0, 7);
      if (!m.has(clave)) m.set(clave, { clave, costos: {}, ordenes: {} });
      const g = m.get(clave);
      for (const [t, c] of Object.entries(o.costoPorTipo || {})) {
        if (tipo && t !== tipo) continue;
        g.costos[t] = (g.costos[t] || 0) + c;
      }
      for (const t of o.tipos) {
        if (tipo && t !== tipo) continue;
        g.ordenes[t] = (g.ordenes[t] || 0) + 1;
      }
    }
    const arr = [...m.values()].sort((a, b) => a.clave.localeCompare(b.clave));
    const max = arr.reduce((mx, g) => Math.max(mx, ...Object.values(g.costos), 0), 0) || 1;
    return { arr, max, porDia };
  }, [base, mes, tipo]);

  const tiposVisibles = tipo ? TIPOS.filter((t) => t.key === tipo) : TIPOS;
  const etiquetaCol = (clave) =>
    serieCol.porDia ? `${clave.slice(8, 10)}/${clave.slice(5, 7)}` : etiquetaMes(clave);

  return (
    <main className="wrap">
      <Nav>
        <button className="btn sync" onClick={cargar} disabled={cargando}>
          {cargando ? "Sincronizando…" : "🔄 Sincronizar"}
        </button>
      </Nav>

      <div className="marco-prueba">

      <h1 className="page-title">Mantenimiento</h1>
      <div className="muted" style={{ marginBottom: "1rem" }}>
        <small>
          Órdenes de trabajo de Cloudfleet con sus trabajos, repuestos y costos.
          {data?.actualizado && (
            <> Actualizado {new Date(data.actualizado).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.</>
          )}
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
        <div className="field">
          <label>Mes</label>
          <select value={mes} onChange={(e) => { setMes(e.target.value); setAbierta(null); }}>
            <option value="">Todos</option>
            {meses.map((m) => (
              <option key={m} value={m}>{etiquetaMes(m)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tipo de mantenimiento</label>
          <select value={tipo} onChange={(e) => { setTipo(e.target.value); setAbierta(null); }}>
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t.key} value={t.key}>{t.key}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="err">⚠️ {error}</div>}
      {cargando && (
        <div className="center muted" style={{ padding: "2rem" }}>
          Cargando órdenes de mantenimiento desde Cloudfleet… La primera carga del día
          puede tardar unos minutos (la API tiene límite de velocidad); después queda en caché.
        </div>
      )}

      {!cargando && !error && (
        <>
          {/* Costos por tipo de mantenimiento (clic = filtrar por ese tipo) */}
          <div className="mant-cards">
            {TIPOS.map((t) => (
              <button
                key={t.key}
                className={`mant-card${tipo === t.key ? " active" : ""}`}
                style={{ borderTopColor: t.color }}
                onClick={() => setTipo(tipo === t.key ? "" : t.key)}
              >
                <div className="mant-card-label" style={{ color: t.color }}>{t.key}</div>
                <div className="mant-card-valor">{fmtPlata.format(resumen.costos[t.key] || 0)}</div>
                <div className="mant-card-sub">
                  {base.filter((o) => o.tipos.includes(t.key)).length} órdenes
                </div>
              </button>
            ))}
            <div className="mant-card mant-card-total" style={{ borderTopColor: "#0d9488" }}>
              <div className="mant-card-label" style={{ color: "#0d9488" }}>Total</div>
              <div className="mant-card-valor">{fmtPlata.format(resumen.total)}</div>
              <div className="mant-card-sub">{base.length} órdenes{mes ? ` · ${etiquetaMes(mes)}` : ""}</div>
            </div>
          </div>

          {/* Gráfico de columnas: costo por tipo, por mes (o por día si hay mes
              elegido). La leyenda filtra por tipo, igual que las tarjetas. */}
          <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            <div className="chart-head">
              <h2>
                Costos por tipo de mantenimiento
                {mes ? ` · ${etiquetaMes(mes)} (por día)` : " (por mes)"}
                {sucursal ? ` · ${sucursal}` : ""}
              </h2>
            </div>
            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>
              Tocá un tipo en la leyenda para filtrar; elegí un mes arriba para abrirlo por día.
            </div>
            <div className="legend" style={{ marginBottom: "0.3rem", flexWrap: "wrap" }}>
              {TIPOS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTipo(tipo === t.key ? "" : t.key); setAbierta(null); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    font: "inherit", color: "inherit",
                    opacity: tipo && tipo !== t.key ? 0.35 : 1,
                    fontWeight: tipo === t.key ? 700 : 400,
                  }}
                >
                  <span className="dot" style={{ background: t.color }} /> {t.key}
                </button>
              ))}
            </div>
            {serieCol.arr.length === 0 ? (
              <div className="center muted">Sin datos para graficar.</div>
            ) : (
              <div className="chart" onMouseLeave={() => setTipCol(null)}>
                {serieCol.arr.map((g) => {
                  const mostrarTip = (e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setTipCol({ x: r.left + r.width / 2, y: r.top, g });
                  };
                  return (
                    <div
                      className="col-group adh-col"
                      key={g.clave}
                      onMouseEnter={mostrarTip}
                      onClick={mostrarTip}
                    >
                      <div className="bars">
                        {tiposVisibles.map((t) => {
                          const c = g.costos[t.key] || 0;
                          if (!c) return null;
                          return (
                            <div
                              key={t.key}
                              className="bar"
                              style={{ height: `${(c / serieCol.max) * 100}%`, background: t.color }}
                            >
                              {tiposVisibles.length === 1 && (
                                <span className="bar-val">{fmtCorto(c)}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="col-label">{etiquetaCol(g.clave)}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {tipCol && (
              <div className="adh-tooltip" style={{ left: tipCol.x, top: tipCol.y }}>
                <div className="tt-title">
                  {etiquetaCol(tipCol.g.clave)} ·{" "}
                  {fmtPlata.format(Object.values(tipCol.g.costos).reduce((s, c) => s + c, 0))}
                </div>
                {tiposVisibles.map((t) => {
                  const c = tipCol.g.costos[t.key];
                  if (!c) return null;
                  return (
                    <div className="tt-row" key={t.key}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: t.color, alignSelf: "center" }} />
                      <span className="tt-patente">{t.key}</span>
                      <span>{fmtPlata.format(c)}</span>
                      <span className="tt-fecha">{tipCol.g.ordenes[t.key] || 0} órd.</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lista de órdenes desplegable */}
          <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            <div className="chart-head">
              <h2>
                Órdenes de trabajo ({filtradas.length})
                {tipo ? ` · ${tipo}` : ""}{sucursal ? ` · ${sucursal}` : ""}
              </h2>
            </div>
            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
              Tocá una orden para ver el detalle de trabajos y repuestos.
            </div>
            {filtradas.length === 0 ? (
              <div className="center muted">Sin órdenes para esos filtros.</div>
            ) : (
              <div className="est-lista">
                {filtradas.map((o) => {
                  const abierto = abierta === o.numero;
                  const suc = normSucursal(o.sucursal);
                  return (
                    <div key={o.numero} className={`est-unidad${abierto ? " abierta" : ""}`}>
                      <button className="est-fila mant-fila" onClick={() => setAbierta(abierto ? null : o.numero)}>
                        <span className="mant-num muted">#{o.numero}</span>
                        <span className="mant-fecha">{fmtFecha(o.fecha)}</span>
                        <span className="est-patente">🚛 {o.patente}</span>
                        {suc && <span className="est-chip-patente">{suc}</span>}
                        <span className="mant-tipos">
                          {o.tipos.map((t) => <BadgeTipo tipo={t} key={t} />)}
                        </span>
                        <span className="mant-costo">{fmtPlata.format(o.costoTotal || 0)}</span>
                        <span className={`est-flecha${abierto ? " girada" : ""}`}>▾</span>
                      </button>
                      {abierto && (
                        <div className="mant-detalle">
                          <div className="mant-meta muted">
                            {o.taller && <span>🔧 {o.taller}</span>}
                            {o.odometro != null && <span>📟 {o.odometro.toLocaleString("es-AR")} km</span>}
                            {o.estado && <span>Estado: {o.estado === "closed" ? "Cerrada" : o.estado === "open" ? "Abierta" : o.estado}</span>}
                            {o.motivo && <span>Motivo: {o.motivo}</span>}
                          </div>
                          {o.comentarios && <div className="mant-coment muted">💬 {o.comentarios}</div>}

                          <div className="mant-subtitulo">Trabajos ({o.trabajos.length}) — {fmtPlata.format(o.costoTrabajos || 0)}</div>
                          {o.trabajos.length === 0 ? (
                            <div className="muted" style={{ fontSize: "0.85rem" }}>Sin trabajos cargados.</div>
                          ) : (
                            <div className="tablewrap">
                              <table>
                                <thead>
                                  <tr><th>Trabajo</th><th>Tipo</th><th>Sistema</th><th>Costo</th><th>Comentario</th></tr>
                                </thead>
                                <tbody>
                                  {o.trabajos.map((t) => (
                                    <tr key={t.id}>
                                      <td style={{ whiteSpace: "normal", minWidth: "180px" }}>{t.nombre}</td>
                                      <td><BadgeTipo tipo={t.tipo} /></td>
                                      <td style={{ whiteSpace: "normal" }} className="muted">
                                        {[t.sistema, t.subsistema].filter(Boolean).join(" · ") || "—"}
                                      </td>
                                      <td>{fmtPlata.format(t.costo || 0)}</td>
                                      <td style={{ whiteSpace: "normal", minWidth: "160px" }} className="muted">{t.comentario || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div className="mant-subtitulo">Repuestos ({o.repuestos.length}) — {fmtPlata.format(o.costoRepuestos || 0)}</div>
                          {o.repuestos.length === 0 ? (
                            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>Sin repuestos cargados.</div>
                          ) : (
                            <div className="tablewrap">
                              <table>
                                <thead>
                                  <tr><th>Repuesto</th><th>Código</th><th>Cant.</th><th>Costo</th><th>Tipo</th></tr>
                                </thead>
                                <tbody>
                                  {o.repuestos.map((r) => (
                                    <tr key={r.id}>
                                      <td style={{ whiteSpace: "normal", minWidth: "180px" }}>{r.nombre}</td>
                                      <td className="muted">{r.codigo || "—"}</td>
                                      <td>{r.cantidad}</td>
                                      <td>{fmtPlata.format(r.costo || 0)}</td>
                                      <td><BadgeTipo tipo={r.tipo} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </main>
  );
}
