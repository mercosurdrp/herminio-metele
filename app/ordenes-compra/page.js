"use client";

// Órdenes de compra (uso corporativo): se emiten acá, con numeración automática
// y correlativa (OC-AAAA-0000 — el número lo asigna el servidor), se imprimen
// con el formato de siempre y se les sigue el estado hasta la factura.
// Datos en Vercel Blob vía /api/ordenes-compra (sin base de datos).
import "../globals.css";
import Nav from "../Nav";
import { useCallback, useEffect, useMemo, useState } from "react";
import HojaOC from "./HojaOC";
import {
  ESTADOS,
  ESTADOS_ABIERTOS,
  IVAS,
  MONEDAS,
  PAGOS,
  PRIORIDADES,
  RUBROS,
  SECTORES,
  SUCURSALES,
  UMEDIDAS,
  estadoInfo,
  fmtFecha,
  fmtMoneda,
  hoyArg,
  totales,
} from "./datos";

const ITEM_VACIO = { codigo: "", descripcion: "", umedida: "Unidad", cantidad: "", precio: "" };

function ordenVacia() {
  return {
    fecha: hoyArg(),
    sucursal: "Eldorado",
    solicitante: "",
    sector: "Administración",
    prioridad: "Normal",
    rubro: "Insumos de oficina y librería",
    destino: "",
    motivo: "",
    prov: "",
    cuit: "",
    ivaProv: "",
    dom: "",
    loc: "",
    tel: "",
    contacto: "",
    email: "",
    pago: "30 días",
    lugar: "",
    requerida: "",
    plazo: "",
    presupuesto: "",
    moneda: "ARS",
    flete: "",
    items: [{ ...ITEM_VACIO }, { ...ITEM_VACIO }, { ...ITEM_VACIO }],
    ivaPct: 0.21,
    fleteOtros: "",
    obs: "",
    estado: "emitida",
    remito: "",
    factura: "",
  };
}

export default function OrdenesCompra() {
  const [ordenes, setOrdenes] = useState([]);
  const [proximo, setProximo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(null); // null = formulario cerrado
  const [editId, setEditId] = useState(null);
  const [verOrden, setVerOrden] = useState(null); // orden en la vista previa

  // Filtros del listado.
  const [fEstado, setFEstado] = useState("");
  const [fSector, setFSector] = useState("");
  const [fRubro, setFRubro] = useState("");
  const [fTexto, setFTexto] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/ordenes-compra", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error al cargar");
      setOrdenes(Array.isArray(j.ordenes) ? j.ordenes : []);
      setProximo(j.proximo || "");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function postear(accion, orden) {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/ordenes-compra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, orden }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Error al guardar");
      setOrdenes(Array.isArray(j.ordenes) ? j.ordenes : []);
      setProximo(j.proximo || "");
      return j.ordenes;
    } catch (e) {
      setError(String(e.message || e));
      return null;
    } finally {
      setGuardando(false);
    }
  }

  function abrirNueva() {
    setEditId(null);
    setForm(ordenVacia());
    setError(null);
  }
  function abrirEdicion(o) {
    setEditId(o.id);
    setForm({ ...ordenVacia(), ...o, items: (o.items || []).map((it) => ({ ...it })) });
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function emitir() {
    if (!form.prov.trim()) return setError("Cargá la razón social del proveedor.");
    const items = form.items.filter((it) => it.descripcion.trim() || it.codigo.trim());
    if (!items.length) return setError("Cargá al menos un ítem con descripción.");
    const payload = { ...form, items };
    const lista = await postear(editId ? "editar" : "crear", editId ? { ...payload, id: editId } : payload);
    if (!lista) return;
    setForm(null);
    setEditId(null);
    // Se abre la vista previa de la orden recién emitida, lista para imprimir.
    const recien = editId ? lista.find((x) => x.id === editId) : lista[lista.length - 1];
    if (recien) setVerOrden(recien);
  }

  async function cambiarEstado(o, estado) {
    await postear("estado", { id: o.id, estado });
  }
  async function actualizarComprobante(o, campo, valor) {
    if ((o[campo] || "") === valor) return;
    await postear("estado", { id: o.id, [campo]: valor });
  }
  async function borrar(o) {
    if (!confirm(`¿Borrar la orden ${o.numero}? No se puede deshacer.`)) return;
    await postear("borrar", { id: o.id });
  }

  function setItem(i, campo, valor) {
    setForm((f) => {
      const items = f.items.map((it, j) => (j === i ? { ...it, [campo]: valor } : it));
      return { ...f, items };
    });
  }
  function agregarItem() {
    setForm((f) => ({ ...f, items: [...f.items, { ...ITEM_VACIO }] }));
  }
  function quitarItem(i) {
    setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }));
  }

  const tot = form ? totales(form) : null;

  const lista = useMemo(() => {
    const txt = fTexto.trim().toLowerCase();
    return ordenes
      .filter((o) => (fEstado ? o.estado === fEstado : true))
      .filter((o) => (fSector ? o.sector === fSector : true))
      .filter((o) => (fRubro ? o.rubro === fRubro : true))
      .filter((o) =>
        txt
          ? `${o.numero} ${o.prov} ${o.motivo} ${o.destino} ${(o.items || []).map((i) => i.descripcion).join(" ")}`
              .toLowerCase()
              .includes(txt)
          : true
      )
      .sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
  }, [ordenes, fEstado, fSector, fRubro, fTexto]);

  const resumen = useMemo(() => {
    const anio = hoyArg().slice(0, 4);
    const mes = hoyArg().slice(0, 7);
    const delAnio = ordenes.filter((o) => String(o.fecha).startsWith(anio) && o.estado !== "anulada");
    const abiertas = delAnio.filter((o) => ESTADOS_ABIERTOS.has(o.estado));
    const montoMes = delAnio
      .filter((o) => String(o.fecha).startsWith(mes))
      .reduce((a, o) => a + Number(o.totales?.total || 0), 0);
    const sinFactura = delAnio.filter((o) => o.estado === "recibida");
    return { anio: delAnio.length, abiertas: abiertas.length, montoMes, sinFactura: sinFactura.length };
  }, [ordenes]);

  return (
    <main className="wrap">
      <Nav>
        <button className="btn sync" onClick={cargar} disabled={cargando}>
          {cargando ? "Cargando…" : "↻ Refrescar"}
        </button>
      </Nav>

      <div className="marco-prueba">
        <h1 className="page-title">Órdenes de compra</h1>
        <p className="page-sub">
          Pedidos de materiales, insumos y servicios de la empresa. La numeración es automática y correlativa:
          la próxima orden es <strong>{proximo || "—"}</strong>.
        </p>

        {error && <div className="err">⚠️ {error}</div>}

        <div className="cards">
          <div className="card">
            <div className="label">Órdenes {hoyArg().slice(0, 4)}</div>
            <div className="value">{resumen.anio}</div>
            <div className="sub">emitidas en el año</div>
          </div>
          <div className="card">
            <div className="label">Abiertas</div>
            <div className="value" style={{ color: resumen.abiertas ? "var(--warn)" : "var(--muted)" }}>
              {resumen.abiertas}
            </div>
            <div className="sub">sin facturar</div>
          </div>
          <div className="card">
            <div className="label">Monto del mes</div>
            <div className="value" style={{ fontSize: "1.5rem" }}>{fmtMoneda(resumen.montoMes)}</div>
            <div className="sub">total con IVA</div>
          </div>
          <div className="card">
            <div className="label">Recibidas s/ factura</div>
            <div className="value" style={{ color: resumen.sinFactura ? "var(--bad)" : "var(--muted)" }}>
              {resumen.sinFactura}
            </div>
            <div className="sub">esperando comprobante</div>
          </div>
        </div>

        {/* Alta / edición */}
        {!form && (
          <button className="btn" onClick={abrirNueva} style={{ marginBottom: "1.2rem" }}>
            + Nueva orden de compra
          </button>
        )}

        {form && (
          <div className="chart-card pda-card" style={{ marginTop: 0 }}>
            <div className="chart-head">
              <h3 style={{ margin: 0 }}>
                {editId ? `Editar ${form.numero || "orden"}` : `Nueva orden · ${proximo || ""}`}
              </h3>
              <button className="chip" onClick={() => { setForm(null); setEditId(null); }}>✖ Cerrar</button>
            </div>

            <div className="pda-form">
              <div className="field" style={{ maxWidth: "150px" }}>
                <label>Fecha de emisión</label>
                <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="field" style={{ maxWidth: "140px" }}>
                <label>Sucursal</label>
                <select value={form.sucursal} onChange={(e) => setForm({ ...form, sucursal: e.target.value })}>
                  {SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field" style={{ minWidth: "160px" }}>
                <label>Solicitante</label>
                <input type="text" value={form.solicitante} placeholder="Quién pide"
                  onChange={(e) => setForm({ ...form, solicitante: e.target.value })} />
              </div>
              <div className="field" style={{ minWidth: "170px" }}>
                <label>Sector solicitante</label>
                <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
                  {SECTORES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="field" style={{ maxWidth: "150px" }}>
                <label>Prioridad</label>
                <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                  {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field" style={{ minWidth: "170px" }}>
                <label>Rubro</label>
                <select value={form.rubro} onChange={(e) => setForm({ ...form, rubro: e.target.value })}>
                  {RUBROS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field" style={{ minWidth: "200px" }}>
                <label>Destino / centro de costo</label>
                <input type="text" value={form.destino} placeholder="Ej: Administración — Eldorado"
                  onChange={(e) => setForm({ ...form, destino: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 2, minWidth: "220px" }}>
                <label>Motivo / referencia</label>
                <input type="text" value={form.motivo} placeholder="Ej: reposición de insumos de septiembre"
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              </div>
            </div>

            <div className="oc-form-sec">Proveedor</div>
            <div className="pda-form">
              <div className="field" style={{ flex: 2, minWidth: "220px" }}>
                <label>Razón social *</label>
                <input type="text" value={form.prov} onChange={(e) => setForm({ ...form, prov: e.target.value })} />
              </div>
              <div className="field" style={{ maxWidth: "160px" }}>
                <label>CUIT</label>
                <input type="text" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
              </div>
              <div className="field" style={{ minWidth: "160px" }}>
                <label>Cond. IVA</label>
                <input type="text" value={form.ivaProv} placeholder="Responsable Inscripto"
                  onChange={(e) => setForm({ ...form, ivaProv: e.target.value })} />
              </div>
              <div className="field" style={{ minWidth: "180px" }}>
                <label>Domicilio</label>
                <input type="text" value={form.dom} onChange={(e) => setForm({ ...form, dom: e.target.value })} />
              </div>
              <div className="field" style={{ minWidth: "150px" }}>
                <label>Localidad</label>
                <input type="text" value={form.loc} onChange={(e) => setForm({ ...form, loc: e.target.value })} />
              </div>
              <div className="field" style={{ maxWidth: "150px" }}>
                <label>Teléfono</label>
                <input type="text" value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} />
              </div>
              <div className="field" style={{ minWidth: "150px" }}>
                <label>Contacto</label>
                <input type="text" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
              </div>
              <div className="field" style={{ minWidth: "190px" }}>
                <label>E-mail</label>
                <input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field" style={{ maxWidth: "160px" }}>
                <label>Condición de pago</label>
                <select value={form.pago} onChange={(e) => setForm({ ...form, pago: e.target.value })}>
                  {PAGOS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="oc-form-sec">Entrega</div>
            <div className="pda-form">
              <div className="field" style={{ flex: 2, minWidth: "220px" }}>
                <label>Lugar de entrega</label>
                <input type="text" value={form.lugar} placeholder="Taller Eldorado…"
                  onChange={(e) => setForm({ ...form, lugar: e.target.value })} />
              </div>
              <div className="field" style={{ maxWidth: "150px" }}>
                <label>Fecha requerida</label>
                <input type="date" value={form.requerida} onChange={(e) => setForm({ ...form, requerida: e.target.value })} />
              </div>
              <div className="field" style={{ maxWidth: "140px" }}>
                <label>Plazo ofrecido</label>
                <input type="text" value={form.plazo} placeholder="48 hs"
                  onChange={(e) => setForm({ ...form, plazo: e.target.value })} />
              </div>
              <div className="field" style={{ minWidth: "170px" }}>
                <label>Presupuesto N°</label>
                <input type="text" value={form.presupuesto} onChange={(e) => setForm({ ...form, presupuesto: e.target.value })} />
              </div>
              <div className="field" style={{ maxWidth: "110px" }}>
                <label>Moneda</label>
                <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                  {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field" style={{ minWidth: "150px" }}>
                <label>Flete / transporte</label>
                <input type="text" value={form.flete} onChange={(e) => setForm({ ...form, flete: e.target.value })} />
              </div>
            </div>

            <div className="oc-form-sec">Detalle del pedido</div>
            <div className="tablewrap">
              <table className="oc-items-edit">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>#</th>
                    <th style={{ width: 120 }}>Código</th>
                    <th>Descripción</th>
                    <th style={{ width: 110 }}>U. medida</th>
                    <th style={{ width: 90 }}>Cantidad</th>
                    <th style={{ width: 130 }}>Precio unit.</th>
                    <th style={{ width: 120 }}>Importe</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, i) => (
                    <tr key={i}>
                      <td className="muted">{i + 1}</td>
                      <td><input type="text" value={it.codigo} onChange={(e) => setItem(i, "codigo", e.target.value)} /></td>
                      <td><input type="text" value={it.descripcion} onChange={(e) => setItem(i, "descripcion", e.target.value)} /></td>
                      <td>
                        <select value={it.umedida} onChange={(e) => setItem(i, "umedida", e.target.value)}>
                          {UMEDIDAS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0" step="0.01" value={it.cantidad} onChange={(e) => setItem(i, "cantidad", e.target.value)} /></td>
                      <td><input type="number" min="0" step="0.01" value={it.precio} onChange={(e) => setItem(i, "precio", e.target.value)} /></td>
                      <td className="d">{fmtMoneda(Number(it.cantidad || 0) * Number(it.precio || 0), form.moneda)}</td>
                      <td>
                        <button className="btn-icon" title="Quitar renglón" onClick={() => quitarItem(i)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="oc-tot-form">
              <button className="chip" onClick={agregarItem}>+ Agregar renglón</button>
              <div className="oc-tot-nums">
                <span>Subtotal <strong>{fmtMoneda(tot.subtotal, form.moneda)}</strong></span>
                <span className="field oc-inline-field">
                  <label>Flete / otros</label>
                  <input type="number" min="0" step="0.01" value={form.fleteOtros}
                    onChange={(e) => setForm({ ...form, fleteOtros: e.target.value })} />
                </span>
                <span className="field oc-inline-field">
                  <label>IVA</label>
                  <select value={form.ivaPct} onChange={(e) => setForm({ ...form, ivaPct: Number(e.target.value) })}>
                    {IVAS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </span>
                <span>IVA <strong>{fmtMoneda(tot.iva, form.moneda)}</strong></span>
                <span className="oc-tot-grande">TOTAL <strong>{fmtMoneda(tot.total, form.moneda)}</strong></span>
              </div>
            </div>

            <div className="pda-form" style={{ marginTop: "0.8rem" }}>
              <div className="field" style={{ flex: 3, minWidth: "260px" }}>
                <label>Observaciones</label>
                <input type="text" value={form.obs} placeholder="Lo que el proveedor tiene que saber"
                  onChange={(e) => setForm({ ...form, obs: e.target.value })} />
              </div>
              <button className="btn" onClick={emitir} disabled={guardando}>
                {guardando ? "Guardando…" : editId ? "💾 Guardar cambios" : "✓ Emitir orden"}
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="filters" style={{ marginTop: "1.5rem" }}>
          <div className="field">
            <label>Estado</label>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sector</label>
            <select value={fSector} onChange={(e) => setFSector(e.target.value)}>
              <option value="">Todos</option>
              {SECTORES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Rubro</label>
            <select value={fRubro} onChange={(e) => setFRubro(e.target.value)}>
              <option value="">Todos</option>
              {RUBROS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Buscar</label>
            <input type="text" value={fTexto} placeholder="N°, proveedor, repuesto…"
              onChange={(e) => setFTexto(e.target.value)} />
          </div>
        </div>

        <div className="list-head" style={{ marginTop: "1rem" }}>
          <h2>Órdenes emitidas</h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>{lista.length} orden(es)</span>
        </div>
        <div className="tablewrap" style={{ marginBottom: "1.5rem" }}>
          <table className="tabla-ocs">
            <thead>
              <tr>
                <th>N° de orden</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Rubro</th>
                <th>Sector / destino</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Remito</th>
                <th>Factura</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan={10} className="center">Cargando…</td></tr>
              )}
              {!cargando && !lista.length && (
                <tr><td colSpan={10} className="center">Todavía no hay órdenes cargadas.</td></tr>
              )}
              {lista.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.numero}</strong></td>
                  <td>{fmtFecha(o.fecha)}</td>
                  <td>{o.prov}</td>
                  <td>{o.rubro}</td>
                  <td>{o.sector}{o.destino ? ` · ${o.destino}` : ""}</td>
                  <td className="d">{fmtMoneda(o.totales?.total, o.moneda)}</td>
                  <td>
                    <select
                      className="oc-estado"
                      style={{ color: estadoInfo(o.estado).color, borderColor: estadoInfo(o.estado).color }}
                      value={o.estado}
                      onChange={(e) => cambiarEstado(o, e.target.value)}
                    >
                      {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input className="oc-comprobante" type="text" defaultValue={o.remito} placeholder="—"
                      onBlur={(e) => actualizarComprobante(o, "remito", e.target.value)} />
                  </td>
                  <td>
                    <input className="oc-comprobante" type="text" defaultValue={o.factura} placeholder="—"
                      onBlur={(e) => actualizarComprobante(o, "factura", e.target.value)} />
                  </td>
                  <td className="oc-acciones">
                    <button className="chip" title="Ver e imprimir" onClick={() => setVerOrden(o)}>🖨️</button>
                    <button className="chip" title="Editar" onClick={() => abrirEdicion(o)}>✏️</button>
                    <button className="btn-icon" title="Borrar" onClick={() => borrar(o)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vista previa imprimible */}
      {verOrden && (
        <div className="oc-modal" onClick={(e) => e.target === e.currentTarget && setVerOrden(null)}>
          <div className="oc-modal-box">
            <div className="oc-modal-actions">
              <button className="btn" onClick={() => window.print()}>🖨️ Imprimir / Guardar PDF</button>
              <button className="chip" onClick={() => setVerOrden(null)}>✖ Cerrar</button>
            </div>
            <HojaOC orden={verOrden} />
          </div>
        </div>
      )}
    </main>
  );
}
