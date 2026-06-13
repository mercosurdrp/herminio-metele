"use client";

import "../globals.css";
import Nav from "../Nav";
import Pda from "../flota/Pda";
import { useEffect, useMemo, useRef, useState } from "react";

// Combustible — dashboard de cargas de Cloudfleet (fuel-entries), año 2026:
// dos recuadros separados estilo Estándar (Camiones · Gas Oil y
// Autoelevadores · Nafta), consumo por camión y por chofer, km/litro,
// costos, filtros por sucursal / mes / día, gráfico de columnas y PDA.

// Flota vigente (16 camiones) — misma lista que la pestaña Mantenimiento.
// Fuente: FLOTA QUILMES ACTUALIZADA AL 31-05-2026.xlsx.
const PATENTES_FLOTA = new Set([
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

// Autoelevadores vigentes (el TOYOTA3 se vendió, no se muestra).
const AUTOELEVADORES = new Set(["TOYOTA4", "TOYOTA5", "TOYOTA6"]);
const esAutoelevador = (patente) => AUTOELEVADORES.has((patente || "").toUpperCase());

// Urea (AdBlue) y aceite no son combustible: quedan fuera del consumo.
const COMBUSTIBLES_REALES = new Set(["GasOil", "NAFTA", "GAS"]);

const fmtPlata = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const fmtNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fmtCorto(n) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function etiquetaMes(ym) {
  const [a, m] = ym.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}
function fmtFecha(iso) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function normSucursal(s) {
  if (!s) return null;
  if (/^iguaz/i.test(s)) return "Iguazú";
  if (/^eldorado/i.test(s)) return "Eldorado";
  return s;
}

// Métricas del gráfico de columnas. Litros va con el número completo arriba
// de cada columna (pedido de Herminio); el costo, abreviado para que entre.
const METRICAS = [
  { key: "litros", label: "Litros", color: "#1d4ed8", fmt: (v) => fmtNum.format(v) },
  { key: "costo", label: "Costo", color: "#9d174d", fmt: (v) => `$${fmtCorto(v)}` },
];

// No hay emoji para esto: máquina tipo Zampi (cargadora con uña) dibujada en SVG.
const IconoAutoelevador = ({ color }) => (
  <svg viewBox="0 0 72 64" width="40" height="40" fill={color} aria-label="Máquina con uña">
    {/* uña: respaldo vertical + horquilla horizontal */}
    <rect x="14" y="32" width="5" height="23" rx="1.5" />
    <rect x="1" y="50" width="18" height="5" rx="1.5" />
    {/* brazo que baja del cuerpo al portauñas */}
    <path d="M17 36 L40 26 L43 33 L20 43 Z" />
    {/* cuerpo */}
    <rect x="28" y="30" width="40" height="18" rx="4" />
    {/* cabina con ventana */}
    <path d="M40 12h14a4 4 0 0 1 4 4v15H36V16a4 4 0 0 1 4-4z" />
    <rect x="41" y="17" width="12" height="9" rx="1.5" fill="#fff" />
    {/* ruedas grandes de cargadora */}
    <circle cx="38" cy="52" r="9" />
    <circle cx="38" cy="52" r="4" fill="#fff" />
    <circle cx="61" cy="52" r="9" />
    <circle cx="61" cy="52" r="4" fill="#fff" />
  </svg>
);

// Los dos recuadros (estilo Estándar): camiones y autoelevadores por separado,
// porque cargan combustibles distintos.
const GRUPOS = [
  {
    key: "camiones",
    emoji: "🚛",
    titulo: "Camiones",
    combustible: "Gas Oil",
    color: "#1d4ed8",
  },
  {
    key: "autoelevadores",
    emoji: <IconoAutoelevador color="#f97316" />,
    titulo: "Autoelevadores Toyota",
    combustible: "Nafta",
    color: "#0d9488",
  },
];

export default function Combustible() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [progreso, setProgreso] = useState(null);
  const [sucursal, setSucursal] = useState("");
  const [mes, setMes] = useState("");
  const [dia, setDia] = useState("");
  const [grupo, setGrupo] = useState("camiones");
  const [metrica, setMetrica] = useState("litros");
  const [ordenCamion, setOrdenCamion] = useState({ col: "litros", desc: true });
  const [tipCol, setTipCol] = useState(null);
  const pedidos = useRef(0);

  // hoy en Argentina (UTC-3) para el PDA
  const hoy = useMemo(
    () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10),
    []
  );

  useEffect(() => {
    let activo = true;
    const pedir = async (seguir) => {
      try {
        const r = await fetch(`/api/combustible${seguir ? "?seguir=1" : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!activo) return;
        if (!j.ok) throw new Error(j.error || "Error al leer las cargas");
        setData(j);
        if (j.parcial && pedidos.current < 6) {
          pedidos.current += 1;
          setProgreso(`Armando histórico de combustible… ${j.entradas.length.toLocaleString("es-AR")} cargas leídas`);
          pedir(true);
        } else {
          setProgreso(null);
          setCargando(false);
        }
      } catch (e) {
        if (!activo) return;
        setError(String(e.message || e));
        setCargando(false);
      }
    };
    pedir(false);
    return () => { activo = false; };
  }, []);

  // Solo combustible real (sin urea/aceite) de camiones de la flota o autoelevadores.
  const entradas = useMemo(
    () =>
      (data?.entradas || []).filter(
        (e) =>
          COMBUSTIBLES_REALES.has(e.combustible) &&
          (PATENTES_FLOTA.has(e.patente) || esAutoelevador(e.patente))
      ),
    [data]
  );

  // Opciones de filtros en cascada: meses (del 2026) → días del mes.
  const meses = useMemo(
    () => [...new Set(entradas.map((e) => (e.fecha || "").slice(0, 7)).filter(Boolean))].sort().reverse(),
    [entradas]
  );
  const dias = useMemo(
    () =>
      mes
        ? [...new Set(entradas.map((e) => e.fecha).filter((f) => f && f.startsWith(mes)))].sort().reverse()
        : [],
    [entradas, mes]
  );

  // Base = filtros de sucursal + período aplicados (los dos grupos juntos).
  const base = useMemo(
    () =>
      entradas.filter((e) => {
        if (sucursal && normSucursal(e.sucursal) !== sucursal) return false;
        if (dia) return e.fecha === dia;
        if (mes) return (e.fecha || "").startsWith(mes);
        return true;
      }),
    [entradas, sucursal, mes, dia]
  );

  const camiones = useMemo(() => base.filter((e) => PATENTES_FLOTA.has(e.patente)), [base]);
  const autoelevadores = useMemo(() => base.filter((e) => esAutoelevador(e.patente)), [base]);
  const entradasGrupo = grupo === "camiones" ? camiones : autoelevadores;

  // Totales por grupo para los recuadros selectores.
  const totalesGrupo = useMemo(() => {
    const t = {};
    for (const g of GRUPOS) {
      const arr = g.key === "camiones" ? camiones : autoelevadores;
      let litros = 0, costo = 0;
      for (const e of arr) {
        litros += e.litros || 0;
        costo += e.costo || 0;
      }
      t[g.key] = { litros, costo, cargas: arr.length };
    }
    return t;
  }, [camiones, autoelevadores]);

  // Tarjetas resumen del grupo elegido.
  const resumen = useMemo(() => {
    let litros = 0, costo = 0, km = 0, horas = 0;
    for (const e of entradasGrupo) {
      litros += e.litros || 0;
      costo += e.costo || 0;
      km += e.km || 0;
      horas += e.horas || 0;
    }
    return {
      litros,
      costo,
      km,
      horas,
      kmxl: litros > 0 && km > 0 ? km / litros : null,
      lph: horas > 0 ? litros / horas : null,
      costoLitro: litros > 0 ? costo / litros : null,
      cargas: entradasGrupo.length,
    };
  }, [entradasGrupo]);

  // Consumo por camión.
  const porCamion = useMemo(() => {
    const m = new Map();
    for (const e of camiones) {
      if (!m.has(e.patente)) {
        m.set(e.patente, { patente: e.patente, sucursal: null, cargas: 0, litros: 0, km: 0, costo: 0 });
      }
      const g = m.get(e.patente);
      g.cargas += 1;
      g.litros += e.litros || 0;
      g.km += e.km || 0;
      g.costo += e.costo || 0;
      if (e.sucursal) g.sucursal = normSucursal(e.sucursal);
    }
    const arr = [...m.values()].map((g) => ({
      ...g,
      kmxl: g.litros > 0 && g.km > 0 ? g.km / g.litros : null,
      costoKm: g.km > 0 ? g.costo / g.km : null,
    }));
    const { col, desc } = ordenCamion;
    arr.sort((a, b) => {
      const va = a[col] ?? -Infinity;
      const vb = b[col] ?? -Infinity;
      if (typeof va === "string") return desc ? vb.localeCompare(va) : va.localeCompare(vb);
      return desc ? vb - va : va - vb;
    });
    return arr;
  }, [camiones, ordenCamion]);

  // Consumo por chofer (del grupo elegido: choferes de camiones u operarios
  // de los autoelevadores).
  const porChofer = useMemo(() => {
    const m = new Map();
    for (const e of entradasGrupo) {
      const c = e.chofer || "(sin chofer)";
      if (!m.has(c)) m.set(c, { chofer: c, cargas: 0, litros: 0, costo: 0, km: 0 });
      const g = m.get(c);
      g.cargas += 1;
      g.litros += e.litros || 0;
      g.costo += e.costo || 0;
      g.km += e.km || 0;
    }
    return [...m.values()]
      .map((g) => ({ ...g, kmxl: g.litros > 0 && g.km > 0 ? g.km / g.litros : null }))
      .sort((a, b) => b.litros - a.litros);
  }, [entradasGrupo]);

  // Autoelevadores: consumo en litros y horas de uso → litros por hora.
  const porAutoelevador = useMemo(() => {
    const m = new Map();
    for (const e of autoelevadores) {
      if (!m.has(e.patente)) {
        m.set(e.patente, { patente: e.patente, cargas: 0, litros: 0, horas: 0, costo: 0, horimetro: null });
      }
      const g = m.get(e.patente);
      g.cargas += 1;
      g.litros += e.litros || 0;
      g.horas += e.horas || 0;
      g.costo += e.costo || 0;
      if (e.horimetro != null) g.horimetro = Math.max(g.horimetro || 0, e.horimetro);
    }
    return [...m.values()]
      .map((g) => ({ ...g, lph: g.horas > 0 ? g.litros / g.horas : null }))
      .sort((a, b) => b.litros - a.litros);
  }, [autoelevadores]);

  // Serie del gráfico: por mes (o por día si hay mes elegido), del grupo elegido.
  const serieCol = useMemo(() => {
    const porDia = Boolean(mes);
    const m = new Map();
    for (const e of entradasGrupo) {
      if (!e.fecha) continue;
      const clave = porDia ? e.fecha : e.fecha.slice(0, 7);
      if (!m.has(clave)) m.set(clave, { clave, litros: 0, costo: 0, cargas: 0, km: 0, horas: 0 });
      const g = m.get(clave);
      g.litros += e.litros || 0;
      g.costo += e.costo || 0;
      g.km += e.km || 0;
      g.horas += e.horas || 0;
      g.cargas += 1;
    }
    const arr = [...m.values()].sort((a, b) => a.clave.localeCompare(b.clave));
    const max = arr.reduce((mx, g) => Math.max(mx, g[metrica]), 0) || 1;
    return { arr, max, porDia };
  }, [entradasGrupo, mes, metrica]);

  const grupoDef = GRUPOS.find((g) => g.key === grupo);
  const met = METRICAS.find((x) => x.key === metrica);
  const etiquetaCol = (clave) =>
    serieCol.porDia ? `${clave.slice(8, 10)}/${clave.slice(5, 7)}` : etiquetaMes(clave);

  const periodoTexto = dia ? fmtFecha(dia) : mes ? etiquetaMes(mes) : "año 2026";

  const Th = ({ col, children, num = true }) => (
    <th
      className={`sortable${num ? " num" : ""}`}
      onClick={() =>
        setOrdenCamion((o) => ({ col, desc: o.col === col ? !o.desc : true }))
      }
    >
      {children}
      {ordenCamion.col === col ? (ordenCamion.desc ? " ▾" : " ▴") : ""}
    </th>
  );

  return (
    <main className="wrap">
      <Nav />

      <h1 className="page-title">Combustible</h1>
      <div className="muted" style={{ marginBottom: "1rem" }}>
        <small>
          Cargas de combustible de Cloudfleet, año 2026 (urea y aceite quedan afuera).
          Camiones de la flota vigente y autoelevadores por separado.
          {data?.actualizado && (
            <> Actualizado {new Date(data.actualizado).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.</>
          )}
        </small>
      </div>

      <div className="filters" style={{ marginBottom: "1rem" }}>
        <div className="field">
          <label>Sucursal</label>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            <option value="">Todas</option>
            <option value="Eldorado">Eldorado</option>
            <option value="Iguazú">Iguazú</option>
          </select>
        </div>
        <div className="field">
          <label>Mes</label>
          <select value={mes} onChange={(e) => { setMes(e.target.value); setDia(""); }}>
            <option value="">Todos</option>
            {meses.map((m) => (
              <option key={m} value={m}>{etiquetaMes(m)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Día</label>
          <select value={dia} onChange={(e) => setDia(e.target.value)} disabled={!mes}>
            <option value="">{mes ? "Todos" : "Elegí un mes"}</option>
            {dias.map((d) => (
              <option key={d} value={d}>{fmtFecha(d)}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="err">⚠️ {error}</div>}
      {(cargando || progreso) && (
        <div className="center muted" style={{ padding: "2rem" }}>
          {progreso ||
            "Cargando cargas de combustible desde Cloudfleet… La primera vez arma el año 2026 completo y puede tardar un par de minutos; después queda guardado."}
        </div>
      )}

      {!cargando && !error && (
        <>
          {/* Recuadros selectores: Camiones (Gas Oil) · Autoelevadores (Nafta) */}
          <div className="est-resumen">
            {GRUPOS.map((g) => {
              const t = totalesGrupo[g.key];
              const activa = grupo === g.key;
              return (
                <button
                  key={g.key}
                  className={`est-tarjeta${activa ? " active" : ""}`}
                  style={activa ? { borderColor: g.color } : undefined}
                  onClick={() => setGrupo(g.key)}
                >
                  <div className="est-dona" style={{ background: `${g.color}22` }}>
                    <div className="est-dona-centro" style={{ fontSize: "2.1rem" }}>{g.emoji}</div>
                  </div>
                  <div>
                    <div className="est-tarjeta-titulo" style={{ color: g.color }}>
                      {g.titulo} · {g.combustible}
                    </div>
                    <div className="est-tarjeta-sub">
                      {fmtNum.format(t.litros)} L en {t.cargas} cargas · {fmtPlata.format(t.costo)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tarjetas resumen del grupo elegido */}
          <div className="cards">
            <div className="card">
              <div className="label">Litros</div>
              <div className="value">{fmtNum.format(resumen.litros)} <span className="unit">L</span></div>
              <div className="sub">{resumen.cargas} cargas · {periodoTexto}</div>
            </div>
            <div className="card">
              <div className="label">Costo</div>
              <div className="value">{fmtPlata.format(resumen.costo)}</div>
              <div className="sub">{grupoDef.combustible.toLowerCase()}</div>
            </div>
            {grupo === "camiones" ? (
              <>
                <div className="card">
                  <div className="label">Km recorridos</div>
                  <div className="value">{fmtNum.format(resumen.km)} <span className="unit">km</span></div>
                  <div className="sub">entre cargas</div>
                </div>
                <div className="card">
                  <div className="label">Km por litro</div>
                  <div className="value">
                    {resumen.kmxl != null ? fmtDec.format(resumen.kmxl) : "—"} <span className="unit">km/L</span>
                  </div>
                  <div className="sub">flota completa</div>
                </div>
              </>
            ) : (
              <>
                <div className="card">
                  <div className="label">Horas de uso</div>
                  <div className="value">{fmtNum.format(resumen.horas)} <span className="unit">hs</span></div>
                  <div className="sub">por horímetro</div>
                </div>
                <div className="card">
                  <div className="label">Litros por hora</div>
                  <div className="value">
                    {resumen.lph != null ? fmtDec.format(resumen.lph) : "—"} <span className="unit">L/h</span>
                  </div>
                  <div className="sub">los 3 equipos</div>
                </div>
              </>
            )}
            <div className="card">
              <div className="label">Costo por litro</div>
              <div className="value">
                {resumen.costoLitro != null ? fmtPlata.format(resumen.costoLitro) : "—"}
              </div>
              <div className="sub">promedio del período</div>
            </div>
          </div>

          {/* Gráfico de columnas del grupo elegido */}
          <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            <div className="chart-head">
              <h2>
                {met.label} · {grupoDef.titulo} {mes ? `· ${etiquetaMes(mes)} (por día)` : "(por mes)"}
                {sucursal ? ` · ${sucursal}` : ""}
              </h2>
              <div className="quick-ranges" style={{ marginBottom: 0 }}>
                {METRICAS.map((mt) => (
                  <button
                    key={mt.key}
                    className={`chip${metrica === mt.key ? " active" : ""}`}
                    onClick={() => setMetrica(mt.key)}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>
              Elegí un mes arriba para abrirlo por día. Tocá una columna para ver el detalle.
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
                        <div
                          className="bar"
                          style={{ height: `${(g[metrica] / serieCol.max) * 100}%`, background: grupoDef.color }}
                        >
                          <span className="bar-val">{met.fmt(g[metrica])}</span>
                        </div>
                      </div>
                      <div className="col-label">{etiquetaCol(g.clave)}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {tipCol && (
              <div className="adh-tooltip" style={{ left: tipCol.x, top: tipCol.y }}>
                <div className="tt-title">{etiquetaCol(tipCol.g.clave)} · {grupoDef.titulo}</div>
                <div className="tt-row"><span className="tt-patente">Litros</span><span>{fmtNum.format(tipCol.g.litros)} L</span></div>
                <div className="tt-row"><span className="tt-patente">Costo</span><span>{fmtPlata.format(tipCol.g.costo)}</span></div>
                {grupo === "camiones" ? (
                  <div className="tt-row"><span className="tt-patente">Km</span><span>{fmtNum.format(tipCol.g.km)} km</span></div>
                ) : (
                  <div className="tt-row"><span className="tt-patente">Horas</span><span>{fmtNum.format(tipCol.g.horas)} hs</span></div>
                )}
                <div className="tt-row"><span className="tt-patente">Cargas</span><span>{tipCol.g.cargas}</span></div>
              </div>
            )}
          </div>

          {grupo === "camiones" ? (
            <>
              {/* Consumo por camión */}
              <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
                <div className="chart-head">
                  <h2>Consumo por camión ({porCamion.length})</h2>
                </div>
                <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
                  Flota vigente (16 unidades) · tocá un encabezado para ordenar · período: {periodoTexto}.
                </div>
                {porCamion.length === 0 ? (
                  <div className="center muted">Sin cargas para esos filtros.</div>
                ) : (
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <Th col="patente" num={false}>Patente</Th>
                          <th>Sucursal</th>
                          <Th col="cargas">Cargas</Th>
                          <Th col="litros">Litros</Th>
                          <Th col="km">Km</Th>
                          <Th col="kmxl">Km/L</Th>
                          <Th col="costo">Costo</Th>
                          <Th col="costoKm">$/Km</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {porCamion.map((c) => (
                          <tr key={c.patente}>
                            <td className="est-patente">🚛 {c.patente}</td>
                            <td>{c.sucursal ? <span className="est-chip-patente">{c.sucursal}</span> : "—"}</td>
                            <td className="num">{c.cargas}</td>
                            <td className="num">{fmtNum.format(c.litros)} L</td>
                            <td className="num">{fmtNum.format(c.km)}</td>
                            <td className="num"><strong>{c.kmxl != null ? fmtDec.format(c.kmxl) : "—"}</strong></td>
                            <td className="num">{fmtPlata.format(c.costo)}</td>
                            <td className="num">{c.costoKm != null ? fmtPlata.format(c.costoKm) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Consumo por chofer */}
              <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
                <div className="chart-head">
                  <h2>Consumo por chofer ({porChofer.length})</h2>
                </div>
                <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
                  Quién cargó combustible en los camiones · período: {periodoTexto}.
                </div>
                {porChofer.length === 0 ? (
                  <div className="center muted">Sin cargas para esos filtros.</div>
                ) : (
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Chofer</th>
                          <th className="num">Cargas</th>
                          <th className="num">Litros</th>
                          <th className="num">Km</th>
                          <th className="num">Km/L</th>
                          <th className="num">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porChofer.map((c) => (
                          <tr key={c.chofer}>
                            <td>👤 {c.chofer}</td>
                            <td className="num">{c.cargas}</td>
                            <td className="num">{fmtNum.format(c.litros)} L</td>
                            <td className="num">{fmtNum.format(c.km)}</td>
                            <td className="num"><strong>{c.kmxl != null ? fmtDec.format(c.kmxl) : "—"}</strong></td>
                            <td className="num">{fmtPlata.format(c.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Consumo por autoelevador */}
              <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
                <div className="chart-head">
                  <h2>Consumo por equipo ({porAutoelevador.length})</h2>
                </div>
                <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
                  Rendimiento por horímetro: litros por hora de uso · período: {periodoTexto}.
                </div>
                {porAutoelevador.length === 0 ? (
                  <div className="center muted">Sin cargas de autoelevadores para esos filtros.</div>
                ) : (
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Equipo</th>
                          <th className="num">Cargas</th>
                          <th className="num">Litros</th>
                          <th className="num">Horas de uso</th>
                          <th className="num">L/hora</th>
                          <th className="num">Horímetro</th>
                          <th className="num">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porAutoelevador.map((a) => (
                          <tr key={a.patente}>
                            <td className="est-patente">🏗️ {a.patente}</td>
                            <td className="num">{a.cargas}</td>
                            <td className="num">{fmtNum.format(a.litros)} L</td>
                            <td className="num">{fmtNum.format(a.horas)} hs</td>
                            <td className="num"><strong>{a.lph != null ? fmtDec.format(a.lph) : "—"}</strong></td>
                            <td className="num">{a.horimetro != null ? fmtNum.format(a.horimetro) : "—"}</td>
                            <td className="num">{fmtPlata.format(a.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Quién cargó los autoelevadores */}
              <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
                <div className="chart-head">
                  <h2>Consumo por operario ({porChofer.length})</h2>
                </div>
                <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
                  Quién cargó nafta en los autoelevadores · período: {periodoTexto}.
                </div>
                {porChofer.length === 0 ? (
                  <div className="center muted">Sin cargas para esos filtros.</div>
                ) : (
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Operario</th>
                          <th className="num">Cargas</th>
                          <th className="num">Litros</th>
                          <th className="num">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porChofer.map((c) => (
                          <tr key={c.chofer}>
                            <td>👤 {c.chofer}</td>
                            <td className="num">{c.cargas}</td>
                            <td className="num">{fmtNum.format(c.litros)} L</td>
                            <td className="num">{fmtPlata.format(c.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Planes de acción */}
          <Pda
            hoy={hoy}
            ambito="combustible"
            descripcion="Planes de acción por desvíos de consumo de combustible. Esta sección no depende de los filtros de arriba: siempre muestra todos los planes."
          />
        </>
      )}
    </main>
  );
}
