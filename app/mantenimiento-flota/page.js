"use client";

import "../globals.css";
import Nav from "../Nav";
import { useEffect, useMemo, useState } from "react";

// Mantenimiento de flota — dashboard de órdenes de trabajo de Cloudfleet:
// costos por tipo (Preventivo / Correctivo / Proactivo / Mejora), filtros por
// sucursal / mes / tipo, y lista desplegable de órdenes con trabajos y repuestos.

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

  useEffect(() => {
    let activo = true;
    fetch("/api/mantenimiento-ordenes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!activo) return;
        if (!j.ok) throw new Error(j.error || "Error al leer las órdenes");
        setData(j);
      })
      .catch((e) => activo && setError(String(e.message || e)))
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, []);

  const ordenes = data?.ordenes || [];

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

  return (
    <main className="wrap">
      <Nav />

      <h1 className="page-title">Mantenimiento de flota</h1>
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
          Cargando órdenes de mantenimiento desde Cloudfleet… (puede tardar unos segundos)
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
    </main>
  );
}
