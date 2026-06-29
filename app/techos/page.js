"use client";

// Revisión de techos de camiones: registro manual de las inspecciones de techo
// de cada unidad. Por cada revisión se anota la falla detectada, la acción
// correctiva, para cuándo queda programada y su estado (pendiente / en curso /
// corregido). Datos en Vercel Blob vía /api/techos (sin base de datos).
import "../globals.css";
import Nav from "../Nav";
import { useCallback, useEffect, useMemo, useState } from "react";

// Flota actualizada (FLOTA QUILMES ACTUALIZADA). Misma lista curada que en
// Repuestos: cada revisión se imputa a una unidad. Si cambia la flota, editar acá.
const FLOTA = [
  { value: "OJA408", label: "OJA408 (1714)" },
  { value: "FUB570", label: "FUB570 (1106)" },
  { value: "AF399KW", label: "AF399KW (3922)" },
  { value: "HJR136", label: "HJR136 (1408)" },
  { value: "OTY696", label: "OTY696 (1915)" },
  { value: "FTI792", label: "FTI792 (1306)" },
  { value: "OTB032", label: "OTB032 (2015)" },
  { value: "AB386KV", label: "AB386KV (2117)" },
  { value: "AB386KU", label: "AB386KU (2217)" },
  { value: "AE445WS", label: "AE445WS (2320)" },
  { value: "AE445WT", label: "AE445WT (2420)" },
  { value: "AE591EV", label: "AE591EV (2521)" },
  { value: "AE523XP", label: "AE523XP (2721)" },
  { value: "AF399KX", label: "AF399KX (3722)" },
  { value: "AF552QZ", label: "AF552QZ (4123)" },
  { value: "AF399KZ", label: "AF399KZ (3822)" },
  { value: "AB729UX", label: "AB729UX (4517 · acoplado)" },
  { value: "AF516JC", label: "AF516JC (4422 · acoplado)" },
];
function etiquetaUnidad(value) {
  const u = FLOTA.find((x) => x.value === value);
  return u ? u.label : value;
}

const ESTADOS = [
  { value: "pendiente", label: "Pendiente", badge: "bad", color: "#dc2626" },
  { value: "en_curso", label: "En curso", badge: "warn", color: "#d97706" },
  { value: "corregido", label: "Corregido", badge: "ok", color: "#16a34a" },
];
function estadoInfo(value) {
  return ESTADOS.find((e) => e.value === value) || ESTADOS[0];
}

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return arg.toISOString().slice(0, 10);
}
function fmtFecha(iso) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export default function Techos() {
  const hoy = hoyArg();
  const [revisiones, setRevisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Formulario de alta.
  const vacio = {
    fecha: hoy, patente: "", falla: "", accion: "",
    fechaProgramada: "", estado: "pendiente", comentario: "",
  };
  const [nuevo, setNuevo] = useState(vacio);

  // Filtros del listado.
  const [fEstado, setFEstado] = useState("");
  const [fPatente, setFPatente] = useState("");

  // Edición inline.
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/techos", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error al cargar");
      setRevisiones(Array.isArray(j.revisiones) ? j.revisiones : []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function postear(accion, revision) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/techos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, revision }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error al guardar");
      setRevisiones(Array.isArray(j.revisiones) ? j.revisiones : []);
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function registrar() {
    if (!nuevo.fecha || !nuevo.patente) {
      setError("Elegí la fecha de revisión y la unidad.");
      return;
    }
    const ok = await postear("crear", nuevo);
    if (ok) setNuevo({ ...vacio, fecha: nuevo.fecha });
  }

  function abrirEdicion(r) {
    setEditId(r.id);
    setEdit({ ...r });
  }
  async function guardarEdicion() {
    const ok = await postear("editar", edit);
    if (ok) {
      setEditId(null);
      setEdit(null);
    }
  }
  async function borrar(r) {
    if (!confirm(`¿Borrar la revisión de ${etiquetaUnidad(r.patente)} del ${fmtFecha(r.fecha)}?`)) return;
    await postear("borrar", { id: r.id });
  }
  // Cambio rápido de estado desde el badge.
  async function cambiarEstado(r, estado) {
    await postear("editar", { id: r.id, estado });
  }

  const lista = useMemo(() => {
    return [...revisiones]
      .filter((r) => (fEstado ? r.estado === fEstado : true))
      .filter((r) => (fPatente ? r.patente === fPatente : true))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }, [revisiones, fEstado, fPatente]);

  const resumen = useMemo(() => {
    const r = { total: revisiones.length, pendiente: 0, en_curso: 0, corregido: 0 };
    for (const x of revisiones) if (r[x.estado] != null) r[x.estado]++;
    return r;
  }, [revisiones]);

  return (
    <main className="wrap">
      <Nav>
        <button className="btn sync" onClick={cargar} disabled={cargando}>
          {cargando ? "Cargando…" : "↻ Refrescar"}
        </button>
      </Nav>

      <div className="marco-prueba">
        <h1 className="page-title">Revisión de techos</h1>
        <p className="page-sub">
          Inspección del techo de cada camión: falla detectada, acción correctiva y seguimiento hasta su corrección.
        </p>

        {error && <div className="err">⚠️ {error}</div>}

        {/* Resumen */}
        <div className="cards">
          <div className="card">
            <div className="label">Revisiones</div>
            <div className="value">{resumen.total}</div>
            <div className="sub">cargadas en total</div>
          </div>
          <div className="card">
            <div className="label">Pendientes</div>
            <div className="value" style={{ color: resumen.pendiente ? "var(--bad)" : "var(--muted)" }}>
              {resumen.pendiente}
            </div>
            <div className="sub">sin empezar</div>
          </div>
          <div className="card">
            <div className="label">En curso</div>
            <div className="value" style={{ color: resumen.en_curso ? "var(--warn)" : "var(--muted)" }}>
              {resumen.en_curso}
            </div>
            <div className="sub">en corrección</div>
          </div>
          <div className="card">
            <div className="label">Corregidas</div>
            <div className="value" style={{ color: "var(--ok)" }}>{resumen.corregido}</div>
            <div className="sub">techo resuelto</div>
          </div>
        </div>

        {/* Alta de revisión */}
        <div className="chart-card pda-card" style={{ marginTop: 0 }}>
          <div className="chart-head">
            <h3 style={{ margin: 0 }}>Nueva revisión de techo</h3>
          </div>
          <div className="pda-form">
            <div className="field" style={{ maxWidth: "150px" }}>
              <label>Fecha de revisión</label>
              <input
                type="date" value={nuevo.fecha} max={hoy}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
              />
            </div>
            <div className="field" style={{ minWidth: "170px" }}>
              <label>Unidad</label>
              <select value={nuevo.patente} onChange={(e) => setNuevo({ ...nuevo, patente: e.target.value })}>
                <option value="">Elegir…</option>
                {FLOTA.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 2, minWidth: "200px" }}>
              <label>Falla detectada</label>
              <input
                type="text" placeholder="Ej: filtración en la unión de chapas"
                value={nuevo.falla}
                onChange={(e) => setNuevo({ ...nuevo, falla: e.target.value })}
              />
            </div>
            <div className="field" style={{ flex: 2, minWidth: "200px" }}>
              <label>Acción correctiva</label>
              <input
                type="text" placeholder="Ej: sellar y reforzar con remaches"
                value={nuevo.accion}
                onChange={(e) => setNuevo({ ...nuevo, accion: e.target.value })}
              />
            </div>
            <div className="field" style={{ maxWidth: "150px" }}>
              <label>Corrección programada</label>
              <input
                type="date" value={nuevo.fechaProgramada}
                onChange={(e) => setNuevo({ ...nuevo, fechaProgramada: e.target.value })}
              />
            </div>
            <div className="field" style={{ maxWidth: "140px" }}>
              <label>Estado</label>
              <select value={nuevo.estado} onChange={(e) => setNuevo({ ...nuevo, estado: e.target.value })}>
                {ESTADOS.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 2, minWidth: "160px" }}>
              <label>Comentario</label>
              <input
                type="text" placeholder="Opcional"
                value={nuevo.comentario}
                onChange={(e) => setNuevo({ ...nuevo, comentario: e.target.value })}
              />
            </div>
            <button className="btn" onClick={registrar} disabled={guardando}>
              {guardando ? "Guardando…" : "+ Registrar revisión"}
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="filters" style={{ marginTop: "1.5rem" }}>
          <div className="field">
            <label>Estado</label>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Unidad</label>
            <select value={fPatente} onChange={(e) => setFPatente(e.target.value)}>
              <option value="">Todas</option>
              {FLOTA.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Listado */}
        <div className="list-head" style={{ marginTop: "1rem" }}>
          <h2>Revisiones registradas</h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>{lista.length} revisión(es)</span>
        </div>
        <div className="tablewrap" style={{ marginBottom: "1.5rem" }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Unidad</th>
                <th>Falla detectada</th>
                <th>Acción correctiva</th>
                <th>Programada</th>
                <th>Estado</th>
                <th>Comentario</th>
                <th className="num">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={8} className="center muted">Cargando…</td></tr>
              ) : lista.length === 0 ? (
                <tr><td colSpan={8} className="center muted">No hay revisiones cargadas. Registrá la primera arriba.</td></tr>
              ) : (
                lista.map((r) =>
                  editId === r.id ? (
                    <tr key={r.id}>
                      <td><input type="date" value={edit.fecha || ""} onChange={(e) => setEdit({ ...edit, fecha: e.target.value })} /></td>
                      <td>
                        <select value={edit.patente || ""} onChange={(e) => setEdit({ ...edit, patente: e.target.value })}>
                          {FLOTA.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </td>
                      <td><input type="text" value={edit.falla || ""} onChange={(e) => setEdit({ ...edit, falla: e.target.value })} /></td>
                      <td><input type="text" value={edit.accion || ""} onChange={(e) => setEdit({ ...edit, accion: e.target.value })} /></td>
                      <td><input type="date" value={edit.fechaProgramada || ""} onChange={(e) => setEdit({ ...edit, fechaProgramada: e.target.value })} /></td>
                      <td>
                        <select value={edit.estado || "pendiente"} onChange={(e) => setEdit({ ...edit, estado: e.target.value })}>
                          {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                        </select>
                      </td>
                      <td><input type="text" value={edit.comentario || ""} onChange={(e) => setEdit({ ...edit, comentario: e.target.value })} /></td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <button className="btn" onClick={guardarEdicion} disabled={guardando} style={{ padding: "0.35rem 0.7rem" }}>Guardar</button>{" "}
                        <button className="chip" onClick={() => { setEditId(null); setEdit(null); }}>Cancelar</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id}>
                      <td>{fmtFecha(r.fecha)}</td>
                      <td style={{ fontWeight: 700 }}>{etiquetaUnidad(r.patente)}</td>
                      <td>{r.falla || "—"}</td>
                      <td>{r.accion || "—"}</td>
                      <td className="muted">{fmtFecha(r.fechaProgramada)}</td>
                      <td>
                        <select
                          className="badge"
                          value={r.estado}
                          onChange={(e) => cambiarEstado(r, e.target.value)}
                          disabled={guardando}
                          style={{ border: "none", cursor: "pointer", fontWeight: 700, color: "#fff", background: estadoInfo(r.estado).color }}
                        >
                          {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                        </select>
                      </td>
                      <td className="muted">{r.comentario || "—"}</td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <button className="chip chip-edit" onClick={() => abrirEdicion(r)}>✏️ Editar</button>{" "}
                        <button className="chip chip-bad" onClick={() => borrar(r)} disabled={guardando}>Borrar</button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
