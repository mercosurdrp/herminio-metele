"use client";

import "../globals.css";
import Link from "next/link";
import Nav from "../Nav";
import Pda from "./Pda";
import { useEffect, useState, useMemo, useCallback } from "react";

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return arg.toISOString().slice(0, 10);
}
function restarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
// Hora Argentina FIJA (UTC−3), sin depender de la zona horaria del navegador:
// se resta 3h al UTC y se formatea en UTC.
function fmtFechaHoraArg(isoUtc, fechaFallback) {
  if (!isoUtc) return fechaFallback || "—";
  const d = new Date(new Date(isoUtc).getTime() - 3 * 60 * 60 * 1000);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
// Lunes de la semana a la que pertenece `fechaISO` (semana de lunes a domingo).
function lunesDeLaSemana(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00Z");
  const dia = d.getUTCDay(); // 0=domingo … 6=sábado
  return restarDias(fechaISO, (dia + 6) % 7);
}
// Primer día del mes de `fechaISO` (YYYY-MM-01).
function primerDiaDelMes(fechaISO) {
  return fechaISO.slice(0, 8) + "01";
}
// Último día de un mes "YYYY-MM" → "YYYY-MM-DD".
function finDeMes(mesISO) {
  const [y, m] = mesISO.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
// Etiqueta corta de mes "YYYY-MM" → "jun 26" (sin toLocaleDateString para no
// arrastrar el mes por zona horaria).
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function etiquetaMes(mesISO) {
  const m = Number(mesISO.slice(5, 7));
  return `${MESES_CORTOS[m - 1] || mesISO} ${mesISO.slice(2, 4)}`;
}
// Semáforo de adherencia: verde ≥95, ámbar ≥80, rojo abajo.
function colorAdherencia(pct) {
  if (pct == null) return "var(--muted)";
  if (pct >= 95) return "var(--ok)";
  if (pct >= 80) return "var(--warn)";
  return "var(--bad)";
}

function badgeEstado(estado) {
  const e = (estado || "").toUpperCase();
  if (e === "APROBADO") return <span className="badge ok">Aprobado</span>;
  if (e.includes("CRIT")) return <span className="badge bad">Crítico</span>;
  if (e.includes("RECH")) return <span className="badge bad">Rechazado</span>;
  return <span className="badge warn">{estado || "—"}</span>;
}
function badgeTipo(tipo) {
  if (tipo === "LIBERACION") return <span className="badge lib">Liberación</span>;
  if (tipo === "RETORNO") return <span className="badge ret">Retorno</span>;
  return <span className="badge">{tipo || "—"}</span>;
}

export default function Flota() {
  const hoy = hoyArg();
  const [desde, setDesde] = useState(restarDias(hoy, 7));
  const [hasta, setHasta] = useState(hoy);
  const [sucursal, setSucursal] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  // Listado colapsado: muestra solo los checks de la fecha más cercana (último día).
  const [colapsado, setColapsado] = useState(true);
  // Gráfico de adherencia: agrupado por día o por mes.
  const [vistaAdh, setVistaAdh] = useState("dia");
  // Tooltip del gráfico de adherencia: {x, y, d} de la columna bajo el cursor.
  const [tipAdh, setTipAdh] = useState(null);
  // Detalle de camiones-día con check incompleto (oculto por defecto).
  const [verIncompletos, setVerIncompletos] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Rangos rápidos: setean desde/hasta y el useEffect dispara la recarga.
  const rangos = [
    { key: "hoy", label: "Hoy", desde: hoy, hasta: hoy },
    { key: "semana", label: "Semana actual", desde: lunesDeLaSemana(hoy), hasta: hoy },
    { key: "mes", label: "Mes", desde: primerDiaDelMes(hoy), hasta: hoy },
  ];
  const rangoActivo = rangos.find((r) => r.desde === desde && r.hasta === hasta)?.key;
  const aplicarRango = (r) => {
    setDesde(r.desde);
    setHasta(r.hasta);
  };

  // Filtro por mes: elegir un mes setea desde/hasta a ese mes completo (el mes
  // en curso corta en hoy). El valor mostrado se deriva del rango actual.
  const mesFiltro =
    desde.slice(0, 7) === hasta.slice(0, 7) &&
    desde.endsWith("-01") &&
    (hasta === finDeMes(hasta.slice(0, 7)) || hasta === hoy)
      ? desde.slice(0, 7)
      : "";
  const aplicarMes = (mes) => {
    if (!mes) return;
    setDesde(mes + "-01");
    setHasta(mes === hoy.slice(0, 7) ? hoy : finDeMes(mes));
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/flota?desde=${desde}&hasta=${hasta}`);
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
    // Auto-refresh: recarga los datos solos cada 5 minutos, sin tocar nada.
    const id = setInterval(() => cargar(), 5 * 60 * 1000);
    // Y vuelve a refrescar cuando volvés a la pestaña del navegador.
    const onFocus = () => cargar();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  // Filtros que se aplican en pantalla (sucursal/tipo/estado).
  const filas = useMemo(() => {
    let f = data?.datos || [];
    if (sucursal) f = f.filter((x) => (x.sucursal || "") === sucursal);
    if (tipo) f = f.filter((x) => x.tipo === tipo);
    if (estado) {
      f = f.filter((x) => {
        const e = (x.estado || "").toUpperCase();
        if (estado === "APROBADO") return e === "APROBADO";
        return e !== "APROBADO"; // "Con observaciones" = rechazado o crítico
      });
    }
    return f;
  }, [data, sucursal, tipo, estado]);

  // Fecha más cercana (último día con datos) dentro de lo ya filtrado.
  const fechaMasCercana = useMemo(() => {
    return filas.reduce((max, x) => (x.fecha && x.fecha > max ? x.fecha : max), "");
  }, [filas]);

  // Filas que se muestran en la tabla: colapsado = solo la fecha más cercana.
  const filasTabla = useMemo(() => {
    if (!colapsado) return filas;
    return filas.filter((x) => x.fecha === fechaMasCercana);
  }, [filas, colapsado, fechaMasCercana]);

  const resumen = useMemo(() => {
    const lib = filas.filter((x) => x.tipo === "LIBERACION").length;
    const ret = filas.filter((x) => x.tipo === "RETORNO").length;
    const aprob = filas.filter((x) => (x.estado || "").toUpperCase() === "APROBADO").length;
    const conObs = filas.length - aprob;
    const pct = filas.length ? Math.round((aprob / filas.length) * 100) : 0;
    return { total: filas.length, lib, ret, aprob, conObs, pct };
  }, [filas]);

  const sucursales = useMemo(() => {
    const s = new Set((data?.datos || []).map((x) => x.sucursal).filter(Boolean));
    return [...s].sort();
  }, [data]);

  // Adherencia liberación↔retorno. Por cada camión y día con actividad (al
  // menos un check), el par está completo si hizo LIBERACION y RETORNO. Un
  // camión con liberación sin retorno (o al revés) baja la adherencia.
  // Aplica solo el filtro de sucursal: el de tipo/estado no, porque la
  // adherencia necesita mirar ambos tipos a la vez.
  const adherencia = useMemo(() => {
    let base = data?.datos || [];
    if (sucursal) base = base.filter((x) => (x.sucursal || "") === sucursal);
    const pares = new Map(); // "fecha|patente" → {fecha, patente, lib, ret}
    for (const x of base) {
      if (!x.fecha || !x.patente) continue;
      const k = `${x.fecha}|${x.patente}`;
      if (!pares.has(k)) pares.set(k, { fecha: x.fecha, patente: x.patente, lib: false, ret: false });
      const p = pares.get(k);
      if (x.tipo === "LIBERACION") p.lib = true;
      else if (x.tipo === "RETORNO") p.ret = true;
    }
    const lista = [...pares.values()];
    const completos = lista.filter((p) => p.lib && p.ret).length;
    const incompletos = lista
      .filter((p) => !(p.lib && p.ret))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.patente.localeCompare(b.patente));
    const pct = lista.length ? Math.round((completos / lista.length) * 1000) / 10 : null;

    // Series por día y por mes: % de camiones con liberación y % con retorno
    // en cada agrupación (dos columnas), más la lista de camiones incompletos
    // (para el tooltip de la barra).
    const agrupar = (claveDe) => {
      const m = new Map();
      for (const p of lista) {
        const clave = claveDe(p.fecha);
        if (!m.has(clave)) m.set(clave, { clave, total: 0, completos: 0, libs: 0, rets: 0, faltantes: [] });
        const g = m.get(clave);
        g.total += 1;
        if (p.lib) g.libs += 1;
        if (p.ret) g.rets += 1;
        if (p.lib && p.ret) g.completos += 1;
        else g.faltantes.push({ patente: p.patente, fecha: p.fecha, falta: p.lib ? "RETORNO" : "LIBERACION" });
      }
      return [...m.values()]
        .sort((a, b) => a.clave.localeCompare(b.clave))
        .map((g) => ({
          ...g,
          pct: Math.round((g.completos / g.total) * 1000) / 10,
          pctLib: Math.round((g.libs / g.total) * 1000) / 10,
          pctRet: Math.round((g.rets / g.total) * 1000) / 10,
          faltantes: g.faltantes.sort(
            (a, b) => a.fecha.localeCompare(b.fecha) || a.patente.localeCompare(b.patente)
          ),
        }));
    };
    return {
      total: lista.length,
      completos,
      incompletos,
      pct,
      serieDia: agrupar((f) => f),
      serieMes: agrupar((f) => f.slice(0, 7)),
    };
  }, [data, sucursal]);

  const serieAdh = vistaAdh === "mes" ? adherencia.serieMes : adherencia.serieDia;

  // Serie para el gráfico de columnas: por día, cuántas liberaciones y retornos.
  const serieDiaria = useMemo(() => {
    const m = new Map();
    for (const x of filas) {
      if (!x.fecha) continue;
      if (!m.has(x.fecha)) m.set(x.fecha, { fecha: x.fecha, lib: 0, ret: 0 });
      const o = m.get(x.fecha);
      if (x.tipo === "LIBERACION") o.lib += 1;
      else if (x.tipo === "RETORNO") o.ret += 1;
    }
    const arr = [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const max = arr.reduce((mx, d) => Math.max(mx, d.lib, d.ret), 0) || 1;
    return { arr, max };
  }, [filas]);

  return (
    <main className="wrap">
      <Nav>
        <button className="btn sync" onClick={cargar} disabled={loading}>
          {loading ? "Sincronizando…" : "🔄 Sincronizar"}
        </button>
      </Nav>

      <div className="marco-prueba">

      <h1 className="page-title">Adherencia</h1>

      {error && <div className="err">⚠️ {error}</div>}

      <div className="cards">
        <div className="card">
          <div className="label">Total checks</div>
          <div className="value">{resumen.total}</div>
          <div className="sub">en el período</div>
        </div>
        <div className="card">
          <div className="label">Liberaciones</div>
          <div className="value">{resumen.lib}</div>
          <div className="sub">salidas a reparto</div>
        </div>
        <div className="card">
          <div className="label">Retornos</div>
          <div className="value">{resumen.ret}</div>
          <div className="sub">vuelta de reparto</div>
        </div>
        <div className="card">
          <div className="label">Aprobados</div>
          <div className="value" style={{ color: "var(--ok)" }}>{resumen.aprob}</div>
          <div className="sub">{resumen.pct}% de cumplimiento</div>
        </div>
        <div className="card">
          <div className="label">Con observaciones</div>
          <div className="value" style={{ color: resumen.conObs ? "var(--bad)" : "var(--muted)" }}>
            {resumen.conObs}
          </div>
          <div className="sub">rechazado / crítico</div>
        </div>
        <div className="card">
          <div className="label">Adherencia</div>
          <div className="value" style={{ color: colorAdherencia(adherencia.pct) }}>
            {adherencia.pct != null ? `${adherencia.pct}%` : "—"}
          </div>
          <div className="sub">
            {adherencia.completos}/{adherencia.total} camiones-día con liberación + retorno
          </div>
        </div>
        <Link href="/repuestos" className="card card-link card-repuestos">
          <div className="label">Gestión de repuestos</div>
          <div className="value">📦</div>
          <div className="sub">Stock del taller · abrir →</div>
        </Link>
      </div>

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
      </div>

      <div className="filters">
        <div className="field">
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="field">
          <label>Mes</label>
          <input
            type="month"
            value={mesFiltro}
            max={hoy.slice(0, 7)}
            onChange={(e) => aplicarMes(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Sucursal</label>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            <option value="">Todas</option>
            {sucursales.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="LIBERACION">Liberación</option>
            <option value="RETORNO">Retorno</option>
          </select>
        </div>
        <div className="field">
          <label>Cumplimiento</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="APROBADO">Aprobados</option>
            <option value="OBS">Con observaciones</option>
          </select>
        </div>
        <button className="btn" onClick={cargar} disabled={loading}>
          {loading ? "Cargando…" : "Aplicar fechas"}
        </button>
      </div>

      <div style={{ marginBottom: "0.6rem" }} className="muted">
        {data?.actualizado && (
          <small>
            Período {data.desde} a {data.hasta} · actualizado{" "}
            {new Date(data.actualizado).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
            {" "}· se actualiza solo cada 5 min · o tocá «Sincronizar»
          </small>
        )}
      </div>

      <div className="chart-card" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
        <div className="chart-head">
          <h2>Adherencia liberación + retorno</h2>
          <div className="quick-ranges" style={{ marginBottom: 0 }}>
            <button
              className={`chip${vistaAdh === "dia" ? " active" : ""}`}
              onClick={() => setVistaAdh("dia")}
            >
              Por día
            </button>
            <button
              className={`chip${vistaAdh === "mes" ? " active" : ""}`}
              onClick={() => setVistaAdh("mes")}
            >
              Por mes
            </button>
          </div>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>
          % de camiones que, habiendo operado, hicieron cada check.
        </div>
        <div className="legend">
          <span><span className="dot lib" /> Liberación</span>
          <span><span className="dot ret" /> Retorno</span>
        </div>
        {serieAdh.length === 0 ? (
          <div className="center muted">Sin datos para graficar.</div>
        ) : (
          <div className="chart" onMouseLeave={() => setTipAdh(null)}>
            {serieAdh.map((d) => {
              const mostrarTip = (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setTipAdh({ x: r.left + r.width / 2, y: r.top, d });
              };
              return (
                <div
                  className="col-group adh-col"
                  key={d.clave}
                  onMouseEnter={mostrarTip}
                  onClick={mostrarTip}
                >
                  <div className="bars">
                    <div className="bar lib adh2" style={{ height: `${d.pctLib}%` }}>
                      <span className="bar-val">{Math.round(d.pctLib)}</span>
                    </div>
                    <div className="bar ret adh2" style={{ height: `${d.pctRet}%` }}>
                      <span className="bar-val">{Math.round(d.pctRet)}</span>
                    </div>
                  </div>
                  <div className="col-label">
                    {vistaAdh === "mes"
                      ? etiquetaMes(d.clave)
                      : `${d.clave.slice(8, 10)}/${d.clave.slice(5, 7)}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tipAdh && (
          <div className="adh-tooltip" style={{ left: tipAdh.x, top: tipAdh.y }}>
            <div className="tt-title">
              {vistaAdh === "mes"
                ? etiquetaMes(tipAdh.d.clave)
                : `${tipAdh.d.clave.slice(8, 10)}/${tipAdh.d.clave.slice(5, 7)}/${tipAdh.d.clave.slice(0, 4)}`}
              {" "}· Lib {tipAdh.d.pctLib}% · Ret {tipAdh.d.pctRet}% ({tipAdh.d.completos}/{tipAdh.d.total} completos)
            </div>
            {tipAdh.d.faltantes.length === 0 ? (
              <div className="tt-ok">✅ Todos los camiones hicieron ambos checks</div>
            ) : (
              <>
                {tipAdh.d.faltantes.slice(0, 14).map((f, i) => (
                  <div className="tt-row" key={`${f.fecha}|${f.patente}|${i}`}>
                    <span className="tt-patente">🚛 {f.patente}</span>
                    {vistaAdh === "mes" && (
                      <span className="tt-fecha">{f.fecha.slice(8, 10)}/{f.fecha.slice(5, 7)}</span>
                    )}
                    <span className={f.falta === "RETORNO" ? "tt-falta-ret" : "tt-falta-lib"}>
                      faltó {f.falta === "RETORNO" ? "Retorno" : "Liberación"}
                    </span>
                  </div>
                ))}
                {tipAdh.d.faltantes.length > 14 && (
                  <div className="tt-mas">… y {tipAdh.d.faltantes.length - 14} más</div>
                )}
              </>
            )}
          </div>
        )}
        {adherencia.incompletos.length > 0 && (
          <div style={{ marginTop: "0.9rem" }}>
            <button className="btn btn-ghost" onClick={() => setVerIncompletos((v) => !v)}>
              {verIncompletos
                ? "Ocultar detalle"
                : `Ver checks incompletos (${adherencia.incompletos.length})`}
            </button>
            {verIncompletos && (
              <div className="tablewrap" style={{ marginTop: "0.6rem", maxHeight: "320px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Patente</th>
                      <th>Hizo</th>
                      <th>Le faltó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adherencia.incompletos.map((p) => (
                      <tr key={`${p.fecha}|${p.patente}`}>
                        <td>
                          {p.fecha.slice(8, 10)}/{p.fecha.slice(5, 7)}/{p.fecha.slice(0, 4)}
                        </td>
                        <td>{p.patente}</td>
                        <td>{p.lib ? badgeTipo("LIBERACION") : badgeTipo("RETORNO")}</td>
                        <td>{p.lib ? badgeTipo("RETORNO") : badgeTipo("LIBERACION")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <Pda hoy={hoy} />

      <div className="list-head">
        <h2>
          Checklists
          {colapsado && fechaMasCercana && (
            <span className="muted">
              {" "}· solo {fechaMasCercana.slice(8, 10)}/{fechaMasCercana.slice(5, 7)}
            </span>
          )}
        </h2>
        <button
          className="btn btn-ghost"
          onClick={() => setColapsado((v) => !v)}
          disabled={filas.length === 0}
        >
          {colapsado
            ? `Ver todo el detalle (${filas.length})`
            : "Colapsar (solo última fecha)"}
        </button>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Patente</th>
              <th>Chofer</th>
              <th>Sucursal</th>
              <th>Estado</th>
              <th>Cumpl.</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="center muted">Cargando datos de Cloudfleet…</td></tr>
            ) : filasTabla.length === 0 ? (
              <tr><td colSpan={8} className="center muted">Sin checklists para los filtros elegidos.</td></tr>
            ) : (
              filasTabla.map((x) => (
                <tr key={x.numero}>
                  <td>{fmtFechaHoraArg(x.fechaHora, x.fecha)}</td>
                  <td>{badgeTipo(x.tipo)}</td>
                  <td>{x.patente || "—"}</td>
                  <td>{x.chofer || "—"}</td>
                  <td>{x.sucursal || "—"}</td>
                  <td>{badgeEstado(x.estado)}</td>
                  <td>{x.cumplimiento != null ? `${x.cumplimiento}%` : "—"}</td>
                  <td className="muted">
                    {x.variablesRech + x.variablesCrit > 0
                      ? `${x.variablesRech} rech · ${x.variablesCrit} crít`
                      : "✓"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <h2>Checks por día</h2>
          <div className="legend">
            <span><span className="dot lib" /> Liberación</span>
            <span><span className="dot ret" /> Retorno</span>
          </div>
        </div>
        {serieDiaria.arr.length === 0 ? (
          <div className="center muted">Sin datos para graficar.</div>
        ) : (
          <div className="chart">
            {serieDiaria.arr.map((d) => (
              <div className="col-group" key={d.fecha}>
                <div className="bars">
                  <div
                    className="bar lib"
                    style={{ height: `${(d.lib / serieDiaria.max) * 100}%` }}
                    title={`${d.fecha} · Liberación: ${d.lib}`}
                  >
                    {d.lib > 0 && <span className="bar-val">{d.lib}</span>}
                  </div>
                  <div
                    className="bar ret"
                    style={{ height: `${(d.ret / serieDiaria.max) * 100}%` }}
                    title={`${d.fecha} · Retorno: ${d.ret}`}
                  >
                    {d.ret > 0 && <span className="bar-val">{d.ret}</span>}
                  </div>
                </div>
                <div className="col-label">
                  {d.fecha.slice(8, 10)}/{d.fecha.slice(5, 7)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
