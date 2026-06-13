"use client";

import "../globals.css";
import Nav from "../Nav";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return arg.toISOString().slice(0, 10);
}
function restarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
function primerDiaDelMes(fechaISO) {
  return fechaISO.slice(0, 8) + "01";
}

const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf3 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

// Color de la disponibilidad: verde ≥95, ámbar 90–95, rojo <90.
function colorDisp(v) {
  if (v == null) return "var(--muted)";
  if (v >= 95) return "var(--ok)";
  if (v >= 90) return "var(--warn)";
  return "var(--bad)";
}
// Color de la probabilidad de falla (alto = malo): rojo ≥50, ámbar ≥20, verde <20.
function colorProb(p) {
  if (p == null) return "var(--muted)";
  if (p >= 50) return "var(--bad)";
  if (p >= 20) return "var(--warn)";
  return "var(--ok)";
}
// Probabilidad de falla en T días: 1 − e^(−λT), con λ = 1/MTBF(días).
function probFalla(mtbfDias, T) {
  if (!mtbfDias || mtbfDias <= 0 || !T) return 0;
  return (1 - Math.exp(-T / mtbfDias)) * 100;
}

// Curva interactiva de probabilidad de falla acumulada: F(t) = 1 − e^(−λt).
function CurvaProb({ lambda, horizonte, label }) {
  const [hover, setHover] = useState(null); // día bajo el cursor
  const W = 760, H = 320, PADL = 46, PADR = 18, PADT = 18, PADB = 40;
  const plotW = W - PADL - PADR, plotH = H - PADT - PADB;

  // Eje X hasta ~99% de prob (o cubriendo el horizonte), acotado a 365 días.
  const maxDias = useMemo(() => {
    if (!lambda || lambda <= 0) return Math.max(horizonte * 2, 60);
    const t99 = 4.605 / lambda;
    return Math.min(365, Math.max(Math.ceil(t99), Math.ceil(horizonte * 1.3), 30));
  }, [lambda, horizonte]);

  const F = (d) => (lambda > 0 ? (1 - Math.exp(-lambda * d)) * 100 : 0);
  const x = (d) => PADL + (d / maxDias) * plotW;
  const y = (p) => PADT + (1 - p / 100) * plotH;

  const N = 120;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * maxDias;
    pts.push([x(d), y(F(d))]);
  }
  const linea = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `M ${x(0)} ${y(0)} ${pts.map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")} L ${x(maxDias)} ${y(0)} Z`;

  const yTicks = [0, 25, 50, 75, 100];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxDias));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let d = ((px - PADL) / plotW) * maxDias;
    d = Math.max(0, Math.min(maxDias, d));
    setHover(d);
  };

  const hoverP = hover != null ? F(hover) : null;
  const tP = F(horizonte);

  return (
    <svg
      className="curva-svg"
      viewBox={`0 0 ${W} ${H}`}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* grilla + eje Y */}
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} className="grid" />
          <text x={PADL - 8} y={y(t) + 4} className="axis" textAnchor="end">{t}%</text>
        </g>
      ))}
      {/* eje X */}
      {xTicks.map((t, i) => (
        <text key={i} x={x(t)} y={H - PADB + 18} className="axis" textAnchor="middle">{t}d</text>
      ))}
      {/* área + curva */}
      <path d={area} className="curva-area" />
      <path d={linea} className="curva-line" />
      {/* marcador del horizonte T */}
      <line x1={x(horizonte)} y1={PADT} x2={x(horizonte)} y2={y(0)} className="t-line" />
      <circle cx={x(horizonte)} cy={y(tP)} r="4" className="t-dot" />
      <text x={x(horizonte) + 6} y={y(tP) - 8} className="t-label">
        {horizonte}d: {nf0.format(tP)}%
      </text>
      {/* hover */}
      {hover != null && (
        <g>
          <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={y(0)} className="hover-line" />
          <circle cx={x(hover)} cy={y(hoverP)} r="4" className="hover-dot" />
          <text
            x={Math.min(x(hover) + 6, W - 90)}
            y={Math.max(y(hoverP) - 10, PADT + 12)}
            className="hover-label"
          >
            {nf0.format(hover)}d → {nf0.format(hoverP)}%
          </text>
        </g>
      )}
      <text x={PADL} y={PADT - 4} className="axis">{label}</text>
    </svg>
  );
}

export default function Mantenimiento() {
  const hoy = hoyArg();
  const [desde, setDesde] = useState(restarDias(hoy, 364));
  const [hasta, setHasta] = useState(hoy);
  const [sucursal, setSucursal] = useState("");
  const [horizonte, setHorizonte] = useState(30); // días para la prob. de falla
  const [ocultos, setOcultos] = useState(() => new Set()); // patentes a NO mostrar
  const [configAbierto, setConfigAbierto] = useState(false);
  const [ordenCol, setOrdenCol] = useState("fallas");
  const [ordenDir, setOrdenDir] = useState("desc");
  const [graficoSel, setGraficoSel] = useState("flota"); // "flota" o patente
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const rangos = [
    { key: "mes", label: "Mes", desde: primerDiaDelMes(hoy), hasta: hoy },
    { key: "trim", label: "Últimos 3 meses", desde: restarDias(hoy, 90), hasta: hoy },
    { key: "anio", label: "Últimos 12 meses", desde: restarDias(hoy, 364), hasta: hoy },
  ];
  const rangoActivo = rangos.find((r) => r.desde === desde && r.hasta === hasta)?.key;
  const aplicarRango = (r) => {
    setDesde(r.desde);
    setHasta(r.hasta);
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/mantenimiento?desde=${desde}&hasta=${hasta}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error al traer datos");
      setData(j);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  // Default: arrancar mostrando solo Camiones (Camionetas/Autoelevadores ocultas).
  // Solo en la primera carga; después se respeta lo que elija el usuario.
  const defaultAplicado = useRef(false);
  useEffect(() => {
    if (defaultAplicado.current || !data?.vehiculos?.length) return;
    setOcultos(
      new Set(
        data.vehiculos.filter((v) => v.categoria !== "Camiones").map((v) => v.patente)
      )
    );
    defaultAplicado.current = true;
  }, [data]);

  const sucursales = useMemo(() => {
    const s = new Set((data?.vehiculos || []).map((v) => v.sucursal).filter(Boolean));
    return [...s].sort();
  }, [data]);

  // Vehículos filtrados por sucursal y por la selección de la tuerca de config.
  const vehiculos = useMemo(() => {
    let v = data?.vehiculos || [];
    if (sucursal) v = v.filter((x) => x.sucursal === sucursal);
    v = v.filter((x) => !ocultos.has(x.patente));
    return v;
  }, [data, sucursal, ocultos]);

  // Orden de la tabla (alterna asc/desc al clickear el encabezado).
  const valorOrden = (v) => {
    switch (ordenCol) {
      case "patente": return v.patente || "";
      case "tipo": return v.tipo || "";
      case "sucursal": return v.sucursal || "";
      case "fallas": return v.fallas;
      case "mtbfkm": return v.mtbf;
      case "mtbfh": return v.mtbfHoras ?? -Infinity;
      case "mttr": return v.mttr;
      case "downtime": return v.downtime;
      case "disp": return v.disponibilidad ?? -Infinity;
      case "prob": return v.mtbfDias ? probFalla(v.mtbfDias, horizonte) : 0;
      default: return 0;
    }
  };
  const vehiculosOrdenados = useMemo(() => {
    const arr = [...vehiculos];
    const dir = ordenDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = valorOrden(a), vb = valorOrden(b);
      if (typeof va === "string") return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculos, ordenCol, ordenDir, horizonte]);

  const ordenarPor = (col) => {
    if (ordenCol === col) setOrdenDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrdenCol(col); setOrdenDir("desc"); }
  };
  const flecha = (col) => (ordenCol === col ? (ordenDir === "asc" ? " ▲" : " ▼") : "");

  // Handlers de la tuerca de selección de vehículos.
  const toggleVeh = (p) =>
    setOcultos((prev) => {
      const n = new Set(prev);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });
  const mostrarTodos = () => setOcultos(new Set());
  const ocultarTodos = () =>
    setOcultos(new Set((data?.vehiculos || []).map((v) => v.patente)));
  // Marca/desmarca toda una categoría de una.
  const toggleCategoria = (items, allOn) =>
    setOcultos((prev) => {
      const n = new Set(prev);
      items.forEach((v) => (allOn ? n.add(v.patente) : n.delete(v.patente)));
      return n;
    });

  // Vehículos agrupados por categoría (para la tuerca).
  const CATEGORIAS = ["Camiones", "Camionetas", "Autoelevadores"];
  const porCategoria = useMemo(() => {
    const m = {};
    for (const c of CATEGORIAS) m[c] = [];
    for (const v of data?.vehiculos || []) (m[v.categoria] || (m[v.categoria] = [])).push(v);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // KPIs de flota recalculados sobre lo filtrado.
  const kpi = useMemo(() => {
    const dias = data?.dias || 0;
    const n = vehiculos.length;
    const base = n * dias * 24; // horas-vehículo calendario
    const fallas = vehiculos.reduce((s, v) => s + v.fallas, 0);
    const odo = vehiculos.reduce((s, v) => s + v.odometro, 0);
    const downtime = vehiculos.reduce((s, v) => s + v.downtime, 0);
    const uptime = Math.max(0, base - downtime);
    const mtbfHoras = fallas ? uptime / fallas : null;
    const mttr = fallas ? downtime / fallas : 0;
    const mtbfDias = mtbfHoras != null ? mtbfHoras / 24 : null;
    // Prob. de que ALGÚN vehículo falle en el horizonte: λ_flota = Σ(1/MTBFᵢ).
    const lambdaFlota = vehiculos.reduce(
      (s, v) => s + (v.mtbfDias ? 1 / v.mtbfDias : 0),
      0
    );
    const esperadas = lambdaFlota * horizonte; // fallas esperadas en T días
    return {
      vehiculos: n,
      conFallas: vehiculos.filter((v) => v.fallas > 0).length,
      fallas,
      downtime,
      mtbf: fallas ? odo / fallas : 0, // km/falla
      mtbfHoras,
      mtbfDias,
      mttr,
      disponibilidad: mtbfHoras != null ? (mtbfHoras / (mtbfHoras + mttr)) * 100 : 100,
      lambdaFlota,
      esperadas,
      probFlota: lambdaFlota > 0 ? (1 - Math.exp(-esperadas)) * 100 : 0,
    };
  }, [vehiculos, data, horizonte]);

  // λ a graficar según el selector (flota completa o un vehículo).
  const graficoVeh = vehiculos.find((v) => v.patente === graficoSel);
  const lambdaGrafico =
    graficoSel === "flota"
      ? kpi.lambdaFlota
      : graficoVeh && graficoVeh.mtbfDias
      ? 1 / graficoVeh.mtbfDias
      : 0;

  return (
    <main className="wrap">
      <Nav>
        <button className="btn sync" onClick={cargar} disabled={loading}>
          {loading ? "Sincronizando…" : "🔄 Sincronizar"}
        </button>
      </Nav>

      <div className="marco-prueba">

      {error && <div className="err">⚠️ {error}</div>}

      <h1 className="page-title">Análisis de falla</h1>

      <div className="quick-ranges">
        {rangos.map((r) => (
          <button
            key={r.key}
            className={`chip${rangoActivo === r.key ? " active" : ""}`}
            onClick={() => aplicarRango(r)}
          >
            {r.label}
          </button>
        ))}
        <label className="horizonte">
          Prob. falla a
          <input
            type="number"
            min="1"
            max="365"
            value={horizonte}
            onChange={(e) => setHorizonte(Math.max(1, Number(e.target.value) || 0))}
          />
          días
        </label>
        <select
          className="suc-select"
          value={sucursal}
          onChange={(e) => setSucursal(e.target.value)}
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="config-wrap">
          <button
            className="btn-icon"
            onClick={() => setConfigAbierto((v) => !v)}
            title="Elegir qué vehículos mostrar"
          >
            ⚙️
          </button>
          {configAbierto && (
            <>
              <div className="config-overlay" onClick={() => setConfigAbierto(false)} />
              <div className="config-panel">
                <div className="config-head">
                  <strong>Vehículos a mostrar</strong>
                  <div className="config-actions">
                    <button onClick={mostrarTodos}>Todos</button>
                    <button onClick={ocultarTodos}>Ninguno</button>
                  </div>
                </div>
                <div className="config-list">
                  {CATEGORIAS.map((cat) => {
                    const items = porCategoria[cat] || [];
                    if (!items.length) return null;
                    const visibles = items.filter((v) => !ocultos.has(v.patente)).length;
                    const allOn = visibles === items.length;
                    const some = visibles > 0 && !allOn;
                    return (
                      <div className="config-group" key={cat}>
                        <label className="config-grouphead">
                          <input
                            type="checkbox"
                            checked={allOn}
                            ref={(el) => { if (el) el.indeterminate = some; }}
                            onChange={() => toggleCategoria(items, allOn)}
                          />
                          <strong>{cat}</strong>
                          <span className="muted">{visibles}/{items.length}</span>
                        </label>
                        {items.map((v) => (
                          <label key={v.patente} className="config-item">
                            <input
                              type="checkbox"
                              checked={!ocultos.has(v.patente)}
                              onChange={() => toggleVeh(v.patente)}
                            />
                            <span>{v.patente}</span>
                            <span className="muted">{v.sucursal || "—"}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Disponibilidad</div>
          <div className="value" style={{ color: colorDisp(kpi.disponibilidad) }}>
            {kpi.disponibilidad != null ? `${nf0.format(kpi.disponibilidad)}%` : "—"}
          </div>
          <div className="sub">por tiempo calendario</div>
        </div>
        <div className="card">
          <div className="label">MTBF (horas)</div>
          <div className="value">
            {kpi.mtbfHoras != null ? nf0.format(kpi.mtbfHoras) : "—"} <span className="unit">h</span>
          </div>
          <div className="sub">
            {kpi.mtbfHoras != null
              ? `${nf0.format(kpi.mtbf)} km · ${nf0.format(kpi.mtbfDias)} días entre fallas`
              : "sin fallas en el período"}
          </div>
          <div className="sub">λ = {nf3.format(kpi.lambdaFlota)} /día</div>
        </div>
        <div className="card">
          <div className="label">MTTR</div>
          <div className="value">{nf0.format(kpi.mttr)}</div>
          <div className="sub">horas por reparación</div>
        </div>
        <div className="card">
          <div className="label">Fallas</div>
          <div className="value">{nf0.format(kpi.fallas)}</div>
          <div className="sub">en el período</div>
        </div>
        <div className="card">
          <div className="label">Horas en taller</div>
          <div className="value">{nf0.format(kpi.downtime)}</div>
          <div className="sub">downtime total</div>
        </div>
        <div className="card">
          <div className="label">Vehículos</div>
          <div className="value">{kpi.vehiculos}</div>
          <div className="sub">{kpi.conFallas} con fallas</div>
        </div>
        <div className="card">
          <div className="label">Prob. falla {horizonte}d</div>
          <div className="value" style={{ color: colorProb(kpi.probFlota) }}>
            {nf0.format(kpi.probFlota)}%
          </div>
          <div className="sub">≈ {nf0.format(kpi.esperadas)} fallas esperadas en {horizonte}d</div>
        </div>
      </div>

      <div style={{ marginBottom: "0.6rem" }} className="muted">
        {data?.actualizado && (
          <small>
            Período {data.desde} a {data.hasta} ({data.dias} días) · actualizado{" "}
            {new Date(data.actualizado).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
          </small>
        )}
      </div>

      <div className="list-head">
        <h2>Por vehículo</h2>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => ordenarPor("patente")}>Patente{flecha("patente")}</th>
              <th className="sortable" onClick={() => ordenarPor("tipo")}>Tipo{flecha("tipo")}</th>
              <th className="sortable" onClick={() => ordenarPor("sucursal")}>Sucursal{flecha("sucursal")}</th>
              <th className="num sortable" onClick={() => ordenarPor("fallas")}>Fallas{flecha("fallas")}</th>
              <th className="num sortable" onClick={() => ordenarPor("mtbfkm")}>MTBF (km){flecha("mtbfkm")}</th>
              <th className="num sortable" onClick={() => ordenarPor("mtbfh")}>MTBF (h){flecha("mtbfh")}</th>
              <th className="num sortable" onClick={() => ordenarPor("mttr")}>MTTR (h){flecha("mttr")}</th>
              <th className="num sortable" onClick={() => ordenarPor("downtime")}>Taller (h){flecha("downtime")}</th>
              <th className="num sortable" onClick={() => ordenarPor("disp")}>Disp.{flecha("disp")}</th>
              <th className="num sortable" onClick={() => ordenarPor("prob")}>Prob. falla {horizonte}d{flecha("prob")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="center muted">Cargando datos de Cloudfleet…</td></tr>
            ) : vehiculosOrdenados.length === 0 ? (
              <tr><td colSpan={10} className="center muted">Sin datos de mantenimiento para el período.</td></tr>
            ) : (
              vehiculosOrdenados.map((v) => {
                const prob = v.fallas ? probFalla(v.mtbfDias, horizonte) : null;
                return (
                  <tr key={v.patente}>
                    <td><strong>{v.patente || "—"}</strong></td>
                    <td className="muted">{v.tipo || "—"}</td>
                    <td>{v.sucursal || "—"}</td>
                    <td className="num">{v.fallas}</td>
                    <td className="num">{v.mtbf ? nf0.format(v.mtbf) : "—"}</td>
                    <td className="num">{v.mtbfHoras != null ? nf0.format(v.mtbfHoras) : "—"}</td>
                    <td className="num">{v.fallas ? nf0.format(v.mttr) : "—"}</td>
                    <td className="num">{nf0.format(v.downtime)}</td>
                    <td className="num" style={{ color: colorDisp(v.disponibilidad), fontWeight: 700 }}>
                      {v.disponibilidad != null ? `${nf0.format(v.disponibilidad)}%` : "—"}
                    </td>
                    <td className="num" style={{ color: colorProb(prob), fontWeight: 700 }}>
                      {prob != null ? `${nf0.format(prob)}%` : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="list-head" style={{ marginTop: "1.6rem" }}>
        <h2>Curva de probabilidad de falla</h2>
        <select
          className="suc-select"
          value={graficoSel}
          onChange={(e) => setGraficoSel(e.target.value)}
        >
          <option value="flota">Flota (general)</option>
          {vehiculos.map((v) => (
            <option key={v.patente} value={v.patente}>{v.patente}</option>
          ))}
        </select>
      </div>
      <div className="chart-card">
        <CurvaProb
          lambda={lambdaGrafico}
          horizonte={horizonte}
          label={graficoSel === "flota" ? "Flota (general)" : graficoSel}
        />
        <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
          Probabilidad acumulada de que ocurra {graficoSel === "flota" ? "al menos una falla en la flota" : "una falla"} en
          función de los días. La línea punteada marca el horizonte ({horizonte}d). Pasá el cursor para ver cada punto.
        </p>
      </div>

      <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
        MTBF (km), MTTR, fallas y horas en taller salen de Cloudfleet. El MTBF en
        horas/días se deriva del tiempo operativo (calendario − taller) entre
        fallas. <strong>Disponibilidad = MTBF / (MTBF + MTTR)</strong>.{" "}
        <strong>Prob. de falla = 1 − e^(−λT)</strong>, con λ = 1/MTBF(días) y T ={" "}
        {horizonte} días. Se excluyen los vehículos de otro negocio. Rango máximo:
        365 días.
      </p>
      </div>
    </main>
  );
}
