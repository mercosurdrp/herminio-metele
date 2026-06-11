"use client";

// Planes de acción (PDA) por incumplimiento de adherencia de checklists.
// Sección independiente de los filtros de fecha de arriba: siempre muestra
// TODOS los planes; solo se filtra por estado.
import { useCallback, useEffect, useMemo, useState } from "react";

const ESTADOS = [
  { value: "no_iniciado", label: "No iniciado" },
  { value: "en_curso", label: "En curso" },
  { value: "cumplido", label: "Cumplido" },
];

function fmtFecha(iso) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function badgePda(estado, vencido) {
  if (vencido) return <span className="badge bad">Vencido</span>;
  if (estado === "cumplido") return <span className="badge ok">Cumplido</span>;
  if (estado === "en_curso") return <span className="badge lib">En curso</span>;
  return <span className="badge warn">No iniciado</span>;
}

export default function Pda({ hoy }) {
  const [planes, setPlanes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  // id del plan cuyo comentario está desplegado (textarea completo); null = todos colapsados.
  const [comentAbierto, setComentAbierto] = useState(null);
  const vacio = { accion: "", responsable: "", vence: "", estado: "no_iniciado", comentario: "" };
  const [nuevo, setNuevo] = useState(vacio);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/pda", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error al leer los PDA");
      setPlanes(j.planes || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const mutar = async (accion, plan) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/pda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, plan }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar el PDA");
      setPlanes(j.planes || []);
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const agregar = async () => {
    if (!nuevo.accion.trim() || !nuevo.responsable.trim() || !nuevo.vence) {
      setError("Completá acción, responsable y fecha de vencimiento.");
      return;
    }
    const ok = await mutar("crear", nuevo);
    if (ok) setNuevo(vacio);
  };

  const borrar = async (p) => {
    if (!window.confirm(`¿Borrar el PDA "${p.accion}"?`)) return;
    await mutar("borrar", { id: p.id });
  };

  // Vencido = pasó la fecha y no está cumplido.
  const estaVencido = useCallback(
    (p) => p.estado !== "cumplido" && p.vence && p.vence < hoy,
    [hoy]
  );

  const filtrados = useMemo(() => {
    let f = [...planes].sort((a, b) => (a.vence || "").localeCompare(b.vence || ""));
    if (filtroEstado === "vencidos") f = f.filter(estaVencido);
    else if (filtroEstado) f = f.filter((p) => p.estado === filtroEstado);
    return f;
  }, [planes, filtroEstado, estaVencido]);

  const cantVencidos = useMemo(() => planes.filter(estaVencido).length, [planes, estaVencido]);

  const filtros = [
    { value: "", label: `Todos (${planes.length})` },
    ...ESTADOS.map((e) => ({
      value: e.value,
      label: `${e.label} (${planes.filter((p) => p.estado === e.value).length})`,
    })),
    { value: "vencidos", label: `Vencidos (${cantVencidos})` },
  ];

  return (
    <div className="chart-card pda-card">
      <div className="chart-head">
        <h2>Planes de acción (PDA)</h2>
        <div className="quick-ranges" style={{ marginBottom: 0 }}>
          {filtros.map((f) => (
            <button
              key={f.value || "todos"}
              className={`chip${filtroEstado === f.value ? " active" : ""}${
                f.value === "vencidos" && cantVencidos > 0 ? " chip-bad" : ""
              }`}
              onClick={() => setFiltroEstado(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
        Para los casos en que no se cumplió la adherencia. Esta sección no depende de los
        filtros de fecha de arriba: siempre muestra todos los planes.
      </div>

      {error && <div className="err">⚠️ {error}</div>}

      <div className="pda-form">
        <div className="field" style={{ flex: 2, minWidth: "220px" }}>
          <label>Acción</label>
          <input
            type="text"
            placeholder="Qué se va a hacer…"
            value={nuevo.accion}
            onChange={(e) => setNuevo({ ...nuevo, accion: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Responsable</label>
          <input
            type="text"
            placeholder="Quién"
            value={nuevo.responsable}
            onChange={(e) => setNuevo({ ...nuevo, responsable: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Vence</label>
          <input
            type="date"
            value={nuevo.vence}
            onChange={(e) => setNuevo({ ...nuevo, vence: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Estado</label>
          <select
            value={nuevo.estado}
            onChange={(e) => setNuevo({ ...nuevo, estado: e.target.value })}
          >
            {ESTADOS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 2, minWidth: "200px" }}>
          <label>Comentario</label>
          <input
            type="text"
            placeholder="Opcional"
            value={nuevo.comentario}
            onChange={(e) => setNuevo({ ...nuevo, comentario: e.target.value })}
          />
        </div>
        <button className="btn" onClick={agregar} disabled={guardando}>
          {guardando ? "Guardando…" : "+ Agregar PDA"}
        </button>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Acción</th>
              <th>Responsable</th>
              <th>Vence</th>
              <th>Estado</th>
              <th>Comentario</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={6} className="center muted">Cargando planes de acción…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="center muted">
                  {planes.length === 0
                    ? "Sin planes de acción todavía. Cargá el primero arriba."
                    : "Ningún PDA con ese estado."}
                </td>
              </tr>
            ) : (
              filtrados.map((p) => {
                const vencido = estaVencido(p);
                return (
                  <tr key={p.id} className={vencido ? "pda-vencido" : ""}>
                    <td style={{ whiteSpace: "normal", minWidth: "220px" }}>{p.accion}</td>
                    <td>{p.responsable}</td>
                    <td className={vencido ? "pda-fecha-vencida" : ""}>
                      {fmtFecha(p.vence)}
                      {vencido && " ⚠️"}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                        {badgePda(p.estado, vencido)}
                        <select
                          className="pda-select"
                          value={p.estado}
                          disabled={guardando}
                          onChange={(e) => mutar("editar", { id: p.id, estado: e.target.value })}
                        >
                          {ESTADOS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td style={{ minWidth: "200px" }}>
                      {comentAbierto === p.id ? (
                        <textarea
                          className="pda-comentario pda-coment-abierto"
                          placeholder="Agregar comentario…"
                          rows={Math.min(8, Math.max(3, Math.ceil((p.comentario || "").length / 45)))}
                          autoFocus
                          key={`${p.id}|${p.comentario || ""}`}
                          defaultValue={p.comentario || ""}
                          disabled={guardando}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            setComentAbierto(null);
                            if (v !== (p.comentario || "")) mutar("editar", { id: p.id, comentario: v });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") e.target.blur();
                          }}
                        />
                      ) : (
                        <button
                          className="pda-coment-resumen"
                          title="Clic para leer completo / editar"
                          onClick={() => setComentAbierto(p.id)}
                        >
                          {p.comentario ? (
                            <>
                              <span className="pda-coment-texto">{p.comentario}</span> ▾
                            </>
                          ) : (
                            <span className="muted">Agregar comentario…</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost pda-borrar"
                        title="Borrar PDA"
                        disabled={guardando}
                        onClick={() => borrar(p)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
