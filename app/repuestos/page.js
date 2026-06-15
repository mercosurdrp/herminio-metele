"use client";

// Gestión de repuestos del taller interno: catálogo editable de consumibles
// (focos, micas, fusibles…), carga de ingresos y salidas, saldo de stock y
// costos. Datos en Vercel Blob vía /api/repuestos (movimientos) y
// /api/repuestos/catalogo (lista de repuestos editable).
import "../globals.css";
import Nav from "../Nav";
import { useCallback, useEffect, useMemo, useState } from "react";

const SUCURSALES = ["Eldorado", "Iguazú"];

// Flota actualizada al 31-05-2026 (FLOTA QUILMES ACTUALIZADA). Lista curada por
// Herminio: cada salida de repuesto se imputa a una de estas unidades para poder
// medir el gasto por camión. Si cambia la flota, editar acá.
const FLOTA = [
  { patente: "OJA408", id: 1714 },
  { patente: "FUB570", id: 1106 },
  { patente: "AF399KW", id: 3922 },
  { patente: "HJR136", id: 1408 },
  { patente: "OTY696", id: 1915 },
  { patente: "FTI792", id: 1306 },
  { patente: "OTB032", id: 2015 },
  { patente: "AB386KV", id: 2117 },
  { patente: "AB386KU", id: 2217 },
  { patente: "AE445WS", id: 2320 },
  { patente: "AE445WT", id: 2420 },
  { patente: "AE591EV", id: 2521 },
  { patente: "AE523XP", id: 2721 },
  { patente: "AF399KX", id: 3722 },
  { patente: "AF552QZ", id: 4123 },
  { patente: "AF399KZ", id: 3822 },
];
const FLOTA_PATENTES = FLOTA.map((u) => u.patente);
function etiquetaUnidad(patente) {
  const u = FLOTA.find((x) => x.patente === patente);
  return u ? `${u.patente} (${u.id})` : patente;
}

function hoyArg() {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return arg.toISOString().slice(0, 10);
}
function restarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
function lunesDeLaSemana(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00Z");
  const dia = d.getUTCDay();
  return restarDias(fechaISO, (dia + 6) % 7);
}
function primerDiaDelMes(fechaISO) {
  return fechaISO.slice(0, 8) + "01";
}
function finDeMes(mesISO) {
  const [y, m] = mesISO.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function fmtFecha(iso) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}
function fmtPesos(n) {
  return "$ " + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
function claveRepuesto(nombre) {
  return String(nombre || "").trim().toUpperCase().replace(/\s+/g, " ");
}
// Deriva la sucursal a partir de la ubicación del catálogo ("Taller Eldorado").
function sucursalDeUbicacion(ub) {
  const u = (ub || "").toLowerCase();
  if (u.includes("eldorado")) return "Eldorado";
  if (u.includes("iguaz")) return "Iguazú";
  return "";
}

export default function Repuestos() {
  const hoy = hoyArg();
  const [movs, setMovs] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Filtros de período (default: año en curso) + sucursal.
  const [desde, setDesde] = useState(hoy.slice(0, 4) + "-01-01");
  const [hasta, setHasta] = useState(hoy);
  const [sucursal, setSucursal] = useState("");

  // Formulario de alta de movimiento.
  const vacio = {
    tipo: "ingreso", repuesto: "", cantidad: "", precio: "",
    sucursal: "", fecha: hoy, ref: "", vehiculo: "", comentario: "",
  };
  const [nuevo, setNuevo] = useState(vacio);

  // Filtros del historial.
  const [fTipo, setFTipo] = useState("");
  const [fRepuesto, setFRepuesto] = useState("");
  const [fVehiculo, setFVehiculo] = useState("");

  // Edición inline de movimientos del historial.
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(null);

  // Panel "Administrar repuestos" (catálogo editable).
  const [verCatalogo, setVerCatalogo] = useState(false);
  const repVacio = { nombre: "", grupo: "", ubicacion: "" };
  const [repNuevo, setRepNuevo] = useState(repVacio);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [rm, rc] = await Promise.all([
        fetch("/api/repuestos", { cache: "no-store" }),
        fetch("/api/repuestos/catalogo", { cache: "no-store" }),
      ]);
      const jm = await rm.json();
      const jc = await rc.json();
      if (!jm.ok) throw new Error(jm.error || "Error al leer los movimientos");
      if (!jc.ok) throw new Error(jc.error || "Error al leer el catálogo");
      setMovs(jm.movimientos || []);
      setCatalogo(jc.catalogo || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Mutación de movimientos.
  const mutar = async (accion, mov) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/repuestos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, mov }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar");
      setMovs(j.movimientos || []);
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  // Mutación del catálogo (lista de repuestos).
  const mutarCatalogo = async (accion, item) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/repuestos/catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, item }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "No se pudo guardar el repuesto");
      setCatalogo(j.catalogo || []);
      return true;
    } catch (e) {
      setError(String(e.message || e));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const registrar = async () => {
    if (!nuevo.repuesto.trim() || !Number(nuevo.cantidad) || !nuevo.fecha) {
      setError("Elegí el repuesto, la cantidad (mayor a 0) y la fecha.");
      return;
    }
    const ok = await mutar("crear", { ...nuevo, repuesto: nuevo.repuesto.trim() });
    if (ok) setNuevo({ ...vacio, tipo: nuevo.tipo, fecha: nuevo.fecha, sucursal: nuevo.sucursal, vehiculo: nuevo.vehiculo });
  };

  const borrar = async (m) => {
    if (!window.confirm(`¿Borrar este movimiento de "${m.repuesto}"?`)) return;
    await mutar("borrar", { id: m.id });
  };

  // Edición inline de un movimiento del historial (corregir una carga errónea).
  const empezarEdicion = (m) => {
    setEditId(m.id);
    setEdit({
      tipo: m.tipo, repuesto: m.repuesto || "",
      cantidad: m.cantidad ?? "", precio: m.precio ?? "",
      sucursal: m.sucursal || "", fecha: m.fecha || hoy,
      ref: m.ref || "", vehiculo: m.vehiculo || "", comentario: m.comentario || "",
    });
  };
  const cancelarEdicion = () => { setEditId(null); setEdit(null); };
  const guardarEdicion = async () => {
    if (!edit.repuesto.trim() || !Number(edit.cantidad) || !edit.fecha) {
      setError("Para guardar: repuesto, cantidad (mayor a 0) y fecha.");
      return;
    }
    const payload = { id: editId, ...edit, repuesto: edit.repuesto.trim() };
    // Si pasa a ingreso, la unidad deja de aplicar.
    if (edit.tipo === "ingreso") payload.vehiculo = "";
    const ok = await mutar("editar", payload);
    if (ok) cancelarEdicion();
  };

  const agregarRepuesto = async () => {
    if (!repNuevo.nombre.trim()) {
      setError("Escribí el nombre del repuesto nuevo.");
      return;
    }
    const ok = await mutarCatalogo("crear", repNuevo);
    if (ok) setRepNuevo(repVacio);
  };

  const borrarRepuesto = async (c) => {
    if (!window.confirm(`¿Quitar "${c.nombre}" de la lista de repuestos?`)) return;
    await mutarCatalogo("borrar", { id: c.id });
  };

  // Al elegir un repuesto del catálogo, autocompleta la sucursal por su ubicación.
  const elegirRepuesto = (nombre) => {
    const cat = catalogo.find((c) => claveRepuesto(c.nombre) === claveRepuesto(nombre));
    const suc = cat ? sucursalDeUbicacion(cat.ubicacion) : "";
    setNuevo((n) => ({ ...n, repuesto: nombre, sucursal: suc || n.sucursal }));
  };

  // Rangos rápidos.
  const rangos = [
    { key: "hoy", label: "Hoy", desde: hoy, hasta: hoy },
    { key: "semana", label: "Semana", desde: lunesDeLaSemana(hoy), hasta: hoy },
    { key: "mes", label: "Mes", desde: primerDiaDelMes(hoy), hasta: hoy },
    { key: "anio", label: "Año", desde: hoy.slice(0, 4) + "-01-01", hasta: hoy },
  ];
  const rangoActivo = rangos.find((r) => r.desde === desde && r.hasta === hasta)?.key;

  const mesFiltro =
    desde.slice(0, 7) === hasta.slice(0, 7) && desde.endsWith("-01") &&
    (hasta === finDeMes(hasta.slice(0, 7)) || hasta === hoy)
      ? desde.slice(0, 7) : "";
  const aplicarMes = (mes) => {
    if (!mes) return;
    setDesde(mes + "-01");
    setHasta(mes === hoy.slice(0, 7) ? hoy : finDeMes(mes));
  };

  const anios = useMemo(() => {
    const s = new Set(movs.map((m) => (m.fecha || "").slice(0, 4)).filter(Boolean));
    s.add(hoy.slice(0, 4));
    return [...s].filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [movs, hoy]);
  const anioFiltro =
    desde.endsWith("-01-01") && desde.slice(0, 4) === hasta.slice(0, 4) &&
    (hasta === desde.slice(0, 4) + "-12-31" || hasta === hoy)
      ? desde.slice(0, 4) : "";
  const aplicarAnio = (a) => {
    if (!a) return;
    setDesde(a + "-01-01");
    setHasta(a === hoy.slice(0, 4) ? hoy : a + "-12-31");
  };

  // Movimientos dentro del período + sucursal (cards de período e historial).
  const enRango = useCallback(
    (m) => {
      const f = m.fecha || "";
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      if (sucursal && (m.sucursal || "") !== sucursal) return false;
      return true;
    },
    [desde, hasta, sucursal]
  );

  // Nombres del catálogo (para el desplegable filtrable y el filtro del historial).
  const nombresCatalogo = useMemo(
    () => catalogo.map((c) => c.nombre).sort((a, b) => a.localeCompare(b)),
    [catalogo]
  );
  // Grupo por clave de repuesto (para mostrarlo en la tabla de stock).
  const grupoPorClave = useMemo(() => {
    const m = new Map();
    for (const c of catalogo) m.set(claveRepuesto(c.nombre), c.grupo || "");
    return m;
  }, [catalogo]);

  // Saldo de stock por repuesto: acumulado hasta "hasta", respetando sucursal.
  // Se siembra con TODO el catálogo (filtrado por sucursal) para que cada
  // repuesto aparezca aunque todavía no tenga movimientos (stock 0).
  const stock = useMemo(() => {
    const m = new Map();
    const sembrar = (nombre) => {
      const k = claveRepuesto(nombre);
      if (!k) return null;
      if (!m.has(k))
        m.set(k, {
          repuesto: nombre, ingresos: 0, salidas: 0,
          costoIng: 0, cantIngConPrecio: 0, ultIngreso: "", ultSalida: "",
        });
      return m.get(k);
    };
    for (const c of catalogo) {
      if (sucursal && sucursalDeUbicacion(c.ubicacion) && sucursalDeUbicacion(c.ubicacion) !== sucursal) continue;
      sembrar(c.nombre);
    }
    for (const x of movs) {
      if (hasta && (x.fecha || "") > hasta) continue;
      if (sucursal && (x.sucursal || "") !== sucursal) continue;
      const g = sembrar(x.repuesto);
      if (!g) continue;
      const c = Number(x.cantidad) || 0;
      const f = x.fecha || "";
      if (x.tipo === "ingreso") {
        g.ingresos += c;
        if (f > g.ultIngreso) g.ultIngreso = f;
        if (x.precio != null) { g.costoIng += c * x.precio; g.cantIngConPrecio += c; }
      } else if (x.tipo === "salida") {
        g.salidas += c;
        if (f > g.ultSalida) g.ultSalida = f;
      }
    }
    return [...m.values()]
      .map((g) => {
        const saldo = Math.round((g.ingresos - g.salidas) * 100) / 100;
        const precioProm = g.cantIngConPrecio > 0 ? g.costoIng / g.cantIngConPrecio : null;
        const valor = precioProm != null ? Math.max(0, saldo) * precioProm : 0;
        return { ...g, grupo: grupoPorClave.get(claveRepuesto(g.repuesto)) || "", saldo, precioProm, valor };
      })
      .sort((a, b) => a.repuesto.localeCompare(b.repuesto));
  }, [movs, catalogo, hasta, sucursal, grupoPorClave]);

  // Saldo actual por clave (para el stock en vivo del repuesto elegido).
  const stockPorClave = useMemo(() => {
    const m = new Map();
    for (const s of stock) m.set(claveRepuesto(s.repuesto), s.saldo);
    return m;
  }, [stock]);
  const stockElegido = nuevo.repuesto.trim()
    ? stockPorClave.get(claveRepuesto(nuevo.repuesto))
    : undefined;

  // Tarjetas resumen.
  const resumen = useMemo(() => {
    const enStock = stock.filter((s) => s.saldo > 0);
    const sinStock = stock.filter((s) => s.saldo <= 0);
    const unidades = stock.reduce((t, s) => t + Math.max(0, s.saldo), 0);
    const valorStock = stock.reduce((t, s) => t + (s.valor || 0), 0);
    const delRango = movs.filter(enRango);
    const costoMov = (tipo) =>
      delRango
        .filter((x) => x.tipo === tipo)
        .reduce((t, x) => t + (x.precio != null ? (Number(x.cantidad) || 0) * x.precio : 0), 0);
    return {
      tipos: enStock.length, unidades, sinStock: sinStock.length,
      valorStock, costoIng: costoMov("ingreso"), costoSal: costoMov("salida"),
    };
  }, [stock, movs, enRango]);

  // Historial de movimientos (más nuevo primero) con período + filtros.
  const historial = useMemo(() => {
    let f = movs.filter(enRango).sort(
      (a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado || "").localeCompare(a.creado || "")
    );
    if (fTipo) f = f.filter((x) => x.tipo === fTipo);
    if (fRepuesto) f = f.filter((x) => claveRepuesto(x.repuesto) === claveRepuesto(fRepuesto));
    if (fVehiculo === "__sin__") f = f.filter((x) => x.tipo === "salida" && !(x.vehiculo || ""));
    else if (fVehiculo) f = f.filter((x) => (x.vehiculo || "") === fVehiculo);
    return f;
  }, [movs, enRango, fTipo, fRepuesto, fVehiculo]);

  // Gasto de salidas imputado a cada unidad de la flota, dentro del período.
  const gastoPorUnidad = useMemo(() => {
    const m = new Map();
    for (const x of movs.filter(enRango)) {
      if (x.tipo !== "salida") continue;
      const k = x.vehiculo || "";
      const g = m.get(k) || { vehiculo: k, salidas: 0, costo: 0 };
      g.salidas += Number(x.cantidad) || 0;
      if (x.precio != null) g.costo += (Number(x.cantidad) || 0) * x.precio;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.costo - a.costo || b.salidas - a.salidas);
  }, [movs, enRango]);

  const esIngreso = nuevo.tipo === "ingreso";

  return (
    <main className="wrap">
      <Nav>
        <button className="btn sync" onClick={cargar} disabled={cargando}>
          {cargando ? "Cargando…" : "🔄 Actualizar"}
        </button>
      </Nav>

      <div className="marco-prueba">
      <h1 className="page-title">Repuestos</h1>
      <p className="page-sub">
        Taller interno · consumibles y repuestos de emergencia (focos, micas, fusibles…)
      </p>

      {error && <div className="err">⚠️ {error}</div>}

      <div className="cards">
        <div className="card">
          <div className="label">Repuestos en stock</div>
          <div className="value">{resumen.tipos}</div>
          <div className="sub">con saldo disponible</div>
        </div>
        <div className="card">
          <div className="label">Unidades en stock</div>
          <div className="value">{fmtNum(resumen.unidades)}</div>
          <div className="sub">suma de saldos</div>
        </div>
        <div className="card">
          <div className="label">Valor de stock</div>
          <div className="value" style={{ fontSize: "1.5rem" }}>{fmtPesos(resumen.valorStock)}</div>
          <div className="sub">saldo × precio promedio</div>
        </div>
        <div className="card">
          <div className="label">Compras del período</div>
          <div className="value" style={{ color: "var(--ok)", fontSize: "1.5rem" }}>{fmtPesos(resumen.costoIng)}</div>
          <div className="sub">costo de ingresos</div>
        </div>
        <div className="card">
          <div className="label">Consumo del período</div>
          <div className="value" style={{ color: "var(--accent)", fontSize: "1.5rem" }}>{fmtPesos(resumen.costoSal)}</div>
          <div className="sub">costo de salidas</div>
        </div>
        <div className="card">
          <div className="label">Sin stock</div>
          <div className="value" style={{ color: resumen.sinStock ? "var(--bad)" : "var(--muted)" }}>
            {resumen.sinStock}
          </div>
          <div className="sub">saldo en cero o negativo</div>
        </div>
      </div>

      {/* Filtros de período + sucursal */}
      <div className="quick-ranges">
        {rangos.map((r) => (
          <button
            key={r.key}
            className={`chip${rangoActivo === r.key ? " active" : ""}`}
            onClick={() => { setDesde(r.desde); setHasta(r.hasta); }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="filters">
        <div className="field">
          <label>Desde</label>
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="field">
          <label>Mes</label>
          <input type="month" value={mesFiltro} max={hoy.slice(0, 7)} onChange={(e) => aplicarMes(e.target.value)} />
        </div>
        <div className="field">
          <label>Año</label>
          <select value={anioFiltro} onChange={(e) => aplicarAnio(e.target.value)}>
            <option value="">—</option>
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Sucursal</label>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            <option value="">Todas</option>
            {SUCURSALES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Carga de movimiento */}
      <div className="chart-card pda-card" style={{ marginTop: 0 }}>
        <div className="chart-head">
          <h2>Cargar movimiento</h2>
          <div className="quick-ranges" style={{ marginBottom: 0 }}>
            <button
              className={`chip${esIngreso ? " active" : ""}`}
              onClick={() => setNuevo({ ...nuevo, tipo: "ingreso" })}
            >
              ⬇️ Ingreso
            </button>
            <button
              className={`chip${!esIngreso ? " active" : ""}`}
              onClick={() => setNuevo({ ...nuevo, tipo: "salida" })}
            >
              ⬆️ Salida
            </button>
          </div>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.7rem" }}>
          {esIngreso
            ? "Ingreso: repuestos que entran al taller (compra, devolución a stock)."
            : "Salida: repuestos que se consumen al usarlos en una reparación."}
        </div>

        <div className="pda-form">
          <div className="field" style={{ flex: 2, minWidth: "220px" }}>
            <label>Repuesto</label>
            <input
              type="text"
              list="lista-repuestos"
              placeholder="Escribí para filtrar o elegí…"
              value={nuevo.repuesto}
              onChange={(e) => elegirRepuesto(e.target.value)}
            />
            <datalist id="lista-repuestos">
              {nombresCatalogo.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {stockElegido !== undefined && (
              <span className="stock-actual">
                Stock actual: <strong>{fmtNum(stockElegido)}</strong>
              </span>
            )}
          </div>
          <div className="field" style={{ maxWidth: "100px" }}>
            <label>Cantidad</label>
            <input
              type="number" min="0" step="any" placeholder="0"
              value={nuevo.cantidad}
              onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })}
            />
          </div>
          <div className="field" style={{ maxWidth: "130px" }}>
            <label>Precio unit. ($)</label>
            <input
              type="number" min="0" step="any" placeholder="0"
              value={nuevo.precio}
              onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Sucursal</label>
            <select value={nuevo.sucursal} onChange={(e) => setNuevo({ ...nuevo, sucursal: e.target.value })}>
              <option value="">—</option>
              {SUCURSALES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{esIngreso ? "Fecha de ingreso" : "Fecha de salida"}</label>
            <input
              type="date" value={nuevo.fecha} max={hoy}
              onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
            />
          </div>
          {esIngreso ? (
            <div className="field" style={{ flex: 1, minWidth: "150px" }}>
              <label>Proveedor / remito</label>
              <input
                type="text"
                placeholder="De dónde vino"
                value={nuevo.ref}
                onChange={(e) => setNuevo({ ...nuevo, ref: e.target.value })}
              />
            </div>
          ) : (
            <div className="field" style={{ flex: 1, minWidth: "170px" }}>
              <label>Unidad (camión)</label>
              <select value={nuevo.vehiculo} onChange={(e) => setNuevo({ ...nuevo, vehiculo: e.target.value })}>
                <option value="">— Elegir unidad —</option>
                {FLOTA.map((u) => (
                  <option key={u.patente} value={u.patente}>{u.patente} ({u.id})</option>
                ))}
              </select>
            </div>
          )}
          <div className="field" style={{ flex: 2, minWidth: "160px" }}>
            <label>Comentario</label>
            <input
              type="text" placeholder="Opcional"
              value={nuevo.comentario}
              onChange={(e) => setNuevo({ ...nuevo, comentario: e.target.value })}
            />
          </div>
          <button className="btn" onClick={registrar} disabled={guardando}>
            {guardando ? "Guardando…" : esIngreso ? "+ Registrar ingreso" : "− Registrar salida"}
          </button>
        </div>
      </div>

      {/* Saldo de stock */}
      <div className="list-head" style={{ marginTop: "1.5rem" }}>
        <h2>Saldo de stock {sucursal && <span className="muted">· {sucursal}</span>}</h2>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          Acumulado al {fmtFecha(hasta)}
        </span>
      </div>
      <div className="tablewrap" style={{ marginBottom: "1.5rem" }}>
        <table>
          <thead>
            <tr>
              <th>Repuesto</th>
              <th>Grupo</th>
              <th className="num">Ingresos</th>
              <th className="num">Salidas</th>
              <th className="num">Saldo</th>
              <th>Últ. ingreso</th>
              <th>Últ. salida</th>
              <th className="num">Precio unit.</th>
              <th className="num">Valor stock</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={9} className="center muted">Cargando…</td></tr>
            ) : stock.length === 0 ? (
              <tr><td colSpan={9} className="center muted">No hay repuestos en el catálogo. Agregá uno en «Administrar repuestos».</td></tr>
            ) : (
              stock.map((s) => (
                <tr key={claveRepuesto(s.repuesto)}>
                  <td style={{ fontWeight: 700 }}>{s.repuesto}</td>
                  <td className="muted">{s.grupo || "—"}</td>
                  <td className="num" style={{ color: "var(--ok)" }}>{fmtNum(s.ingresos)}</td>
                  <td className="num" style={{ color: "var(--accent)" }}>{fmtNum(s.salidas)}</td>
                  <td className="num">
                    <span className={`badge ${s.saldo > 0 ? "ok" : "bad"}`}>{fmtNum(s.saldo)}</span>
                  </td>
                  <td className="muted">{s.ultIngreso ? fmtFecha(s.ultIngreso) : "—"}</td>
                  <td className="muted">{s.ultSalida ? fmtFecha(s.ultSalida) : "—"}</td>
                  <td className="num muted">{s.precioProm != null ? fmtPesos(s.precioProm) : "—"}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{s.precioProm != null ? fmtPesos(s.valor) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Gasto de repuestos por unidad de la flota */}
      <div className="list-head" style={{ marginTop: "1.5rem" }}>
        <h2>Gasto por unidad <span className="muted">· salidas del período</span></h2>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          {fmtFecha(desde)} – {fmtFecha(hasta)}
        </span>
      </div>
      <div className="tablewrap" style={{ marginBottom: "1.5rem" }}>
        <table>
          <thead>
            <tr>
              <th>Unidad (camión)</th>
              <th className="num">Repuestos consumidos</th>
              <th className="num">Gasto</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={3} className="center muted">Cargando…</td></tr>
            ) : gastoPorUnidad.length === 0 ? (
              <tr><td colSpan={3} className="center muted">No hay salidas en el período.</td></tr>
            ) : (
              gastoPorUnidad.map((g) => (
                <tr key={g.vehiculo || "__sin__"}>
                  <td style={{ fontWeight: 700 }}>
                    {g.vehiculo ? etiquetaUnidad(g.vehiculo) : <span className="muted">Sin asignar</span>}
                  </td>
                  <td className="num">{fmtNum(g.salidas)}</td>
                  <td className="num" style={{ fontWeight: 700, color: "var(--accent)" }}>{fmtPesos(g.costo)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Administrar repuestos (catálogo editable) */}
      <div className="chart-card pda-card" style={{ borderTopColor: "#f97316" }}>
        <div className="chart-head">
          <h2>📦 Administrar repuestos</h2>
          <button className="btn btn-ghost" onClick={() => setVerCatalogo((v) => !v)}>
            {verCatalogo ? "Ocultar" : `Editar lista (${catalogo.length})`}
          </button>
        </div>
        <div className="muted" style={{ fontSize: "0.85rem", marginBottom: verCatalogo ? "0.7rem" : 0 }}>
          La lista de repuestos del desplegable. Agregá los que necesites o quitá los que no uses.
        </div>

        {verCatalogo && (
          <>
            <div className="pda-form">
              <div className="field" style={{ flex: 2, minWidth: "220px" }}>
                <label>Nombre del repuesto</label>
                <input
                  type="text" placeholder="Ej. RELÉ 24V"
                  value={repNuevo.nombre}
                  onChange={(e) => setRepNuevo({ ...repNuevo, nombre: e.target.value })}
                />
              </div>
              <div className="field" style={{ minWidth: "140px" }}>
                <label>Grupo</label>
                <input
                  type="text" placeholder="Ej. Eléctrico"
                  value={repNuevo.grupo}
                  onChange={(e) => setRepNuevo({ ...repNuevo, grupo: e.target.value })}
                />
              </div>
              <div className="field" style={{ minWidth: "150px" }}>
                <label>Ubicación</label>
                <input
                  type="text" placeholder="Ej. Taller Eldorado"
                  value={repNuevo.ubicacion}
                  onChange={(e) => setRepNuevo({ ...repNuevo, ubicacion: e.target.value })}
                />
              </div>
              <button className="btn" onClick={agregarRepuesto} disabled={guardando}>
                {guardando ? "Guardando…" : "+ Agregar repuesto"}
              </button>
            </div>

            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Repuesto</th>
                    <th>Grupo</th>
                    <th>Ubicación</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {catalogo.length === 0 ? (
                    <tr><td colSpan={4} className="center muted">Sin repuestos en la lista.</td></tr>
                  ) : (
                    [...catalogo]
                      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
                      .map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 700 }}>{c.nombre}</td>
                          <td className="muted">{c.grupo || "—"}</td>
                          <td className="muted">{c.ubicacion || "—"}</td>
                          <td>
                            <button
                              className="btn btn-ghost pda-borrar"
                              title="Quitar de la lista"
                              disabled={guardando}
                              onClick={() => borrarRepuesto(c)}
                            >
                              🗑
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Historial de movimientos */}
      <div className="list-head" style={{ marginTop: "1.5rem" }}>
        <h2>Movimientos <span className="muted">· {historial.length}</span></h2>
        <div className="quick-ranges" style={{ marginBottom: 0 }}>
          <button className={`chip${fTipo === "" ? " active" : ""}`} onClick={() => setFTipo("")}>Todos</button>
          <button className={`chip${fTipo === "ingreso" ? " active" : ""}`} onClick={() => setFTipo("ingreso")}>Ingresos</button>
          <button className={`chip${fTipo === "salida" ? " active" : ""}`} onClick={() => setFTipo("salida")}>Salidas</button>
          {nombresCatalogo.length > 0 && (
            <select className="suc-select" value={fRepuesto} onChange={(e) => setFRepuesto(e.target.value)}>
              <option value="">Todos los repuestos</option>
              {nombresCatalogo.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
          <select className="suc-select" value={fVehiculo} onChange={(e) => setFVehiculo(e.target.value)}>
            <option value="">Todas las unidades</option>
            {FLOTA_PATENTES.map((p) => (
              <option key={p} value={p}>{etiquetaUnidad(p)}</option>
            ))}
            <option value="__sin__">Sin unidad</option>
          </select>
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Repuesto</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio unit.</th>
              <th className="num">Costo</th>
              <th>Sucursal</th>
              <th>Proveedor</th>
              <th>Comentario</th>
              <th>Unidad (camión)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={11} className="center muted">Cargando…</td></tr>
            ) : historial.length === 0 ? (
              <tr><td colSpan={11} className="center muted">Sin movimientos para el filtro elegido.</td></tr>
            ) : (
              historial.map((m) =>
                editId === m.id ? (
                  // Fila en modo edición.
                  <tr key={m.id}>
                    <td>
                      <input type="date" value={edit.fecha} max={hoy}
                        onChange={(e) => setEdit({ ...edit, fecha: e.target.value })} />
                    </td>
                    <td>
                      <select value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value })}>
                        <option value="ingreso">⬇️ Ingreso</option>
                        <option value="salida">⬆️ Salida</option>
                      </select>
                    </td>
                    <td>
                      <input type="text" list="lista-repuestos" value={edit.repuesto}
                        onChange={(e) => setEdit({ ...edit, repuesto: e.target.value })} />
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="any" style={{ maxWidth: "80px" }} value={edit.cantidad}
                        onChange={(e) => setEdit({ ...edit, cantidad: e.target.value })} />
                    </td>
                    <td className="num">
                      <input type="number" min="0" step="any" style={{ maxWidth: "100px" }} value={edit.precio}
                        onChange={(e) => setEdit({ ...edit, precio: e.target.value })} />
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {edit.precio !== "" && edit.precio != null
                        ? fmtPesos((Number(edit.cantidad) || 0) * Number(edit.precio)) : "—"}
                    </td>
                    <td>
                      <select value={edit.sucursal} onChange={(e) => setEdit({ ...edit, sucursal: e.target.value })}>
                        <option value="">—</option>
                        {SUCURSALES.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    </td>
                    <td>
                      <input type="text" value={edit.ref}
                        onChange={(e) => setEdit({ ...edit, ref: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" value={edit.comentario}
                        onChange={(e) => setEdit({ ...edit, comentario: e.target.value })} />
                    </td>
                    <td>
                      {edit.tipo === "salida" ? (
                        <select className="suc-select" value={edit.vehiculo}
                          onChange={(e) => setEdit({ ...edit, vehiculo: e.target.value })}>
                          <option value="">— Asignar —</option>
                          {FLOTA.map((u) => (<option key={u.patente} value={u.patente}>{u.patente} ({u.id})</option>))}
                        </select>
                      ) : (<span className="muted">—</span>)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: "0.35rem 0.6rem" }} disabled={guardando}
                        onClick={guardarEdicion} title="Guardar cambios">💾</button>{" "}
                      <button className="btn btn-ghost" style={{ padding: "0.35rem 0.6rem" }} disabled={guardando}
                        onClick={cancelarEdicion} title="Cancelar">✖</button>
                    </td>
                  </tr>
                ) : (
                  // Fila en modo vista.
                  <tr key={m.id}>
                    <td>{fmtFecha(m.fecha)}</td>
                    <td>
                      {m.tipo === "ingreso"
                        ? <span className="badge ok">⬇️ Ingreso</span>
                        : <span className="badge lib">⬆️ Salida</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{m.repuesto}</td>
                    <td className="num">{fmtNum(m.cantidad)}</td>
                    <td className="num muted">{m.precio != null ? fmtPesos(m.precio) : "—"}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {m.precio != null ? fmtPesos((Number(m.cantidad) || 0) * m.precio) : "—"}
                    </td>
                    <td>{m.sucursal || "—"}</td>
                    <td className="muted">{m.ref || "—"}</td>
                    <td style={{ whiteSpace: "normal", maxWidth: "220px" }} className="muted">{m.comentario || "—"}</td>
                    <td>
                      {m.tipo === "salida" ? (
                        <select
                          className="suc-select"
                          value={m.vehiculo || ""}
                          disabled={guardando}
                          onChange={(e) => mutar("editar", { id: m.id, vehiculo: e.target.value })}
                        >
                          <option value="">— Asignar —</option>
                          {FLOTA.map((u) => (
                            <option key={u.patente} value={u.patente}>{u.patente} ({u.id})</option>
                          ))}
                        </select>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="btn btn-ghost"
                        title="Editar movimiento"
                        disabled={guardando}
                        onClick={() => empezarEdicion(m)}
                      >
                        ✏️
                      </button>{" "}
                      <button
                        className="btn btn-ghost pda-borrar"
                        title="Borrar movimiento"
                        disabled={guardando}
                        onClick={() => borrar(m)}
                      >
                        🗑
                      </button>
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
