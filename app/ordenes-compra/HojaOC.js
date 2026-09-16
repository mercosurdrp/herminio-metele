"use client";

// La orden de compra tal como se imprime: mismo formato que el modelo en papel
// (ORDEN_DE_COMPRA_MODELO.xlsx). Se usa en la vista previa y es lo único que
// queda visible al imprimir (ver @media print en globals.css).
import { CONDICIONES, EMISOR, fmtFecha, fmtMoneda, totales } from "./datos";

const FILAS_MINIMAS = 8; // renglones en blanco para que la hoja no quede corta

function Campo({ label, valor, ancho }) {
  return (
    <div className="oc-campo" style={ancho ? { gridColumn: `span ${ancho}` } : undefined}>
      <span className="oc-campo-label">{label}</span>
      <span className="oc-campo-valor">{valor || " "}</span>
    </div>
  );
}

export default function HojaOC({ orden }) {
  const t = orden.totales || totales(orden);
  const items = orden.items || [];
  const vacias = Math.max(0, FILAS_MINIMAS - items.length);
  const mon = orden.moneda || "ARS";

  return (
    <div className="oc-hoja">
      <div className="oc-banda">
        <img className="oc-banda-logo" src="/logo-mercosur-distri.svg" alt="Mercosur Distribuciones" />
        <div className="oc-banda-tit">
          <strong>ORDEN DE COMPRA</strong>
          <span>Documento interno · Misiones</span>
        </div>
      </div>
      <div className="oc-emisor">
        {EMISOR.razon} · CUIT: {EMISOR.cuit} · {EMISOR.domicilio} · Tel.: {EMISOR.tel} ·
        e-mail: {EMISOR.email}
      </div>

      <div className="oc-sec">DATOS DE LA ORDEN</div>
      <div className="oc-grid">
        <Campo label="N° DE ORDEN" valor={<strong>{orden.numero}</strong>} />
        <Campo label="FECHA DE EMISIÓN" valor={fmtFecha(orden.fecha)} />
        <Campo label="SUCURSAL" valor={orden.sucursal} />
        <Campo label="SOLICITANTE" valor={orden.solicitante} />
        <Campo label="SECTOR SOLICITANTE" valor={orden.sector} />
        <Campo label="PRIORIDAD" valor={orden.prioridad} />
        <Campo label="RUBRO" valor={orden.rubro} />
        <Campo label="DESTINO / CENTRO DE COSTO" valor={orden.destino} />
        <Campo label="MOTIVO / REFERENCIA" valor={orden.motivo} />
      </div>

      <div className="oc-sec">PROVEEDOR</div>
      <div className="oc-grid">
        <Campo label="RAZÓN SOCIAL" valor={orden.prov} />
        <Campo label="CUIT" valor={orden.cuit} />
        <Campo label="COND. IVA" valor={orden.ivaProv} />
        <Campo label="DOMICILIO" valor={orden.dom} />
        <Campo label="LOCALIDAD" valor={orden.loc} />
        <Campo label="TELÉFONO" valor={orden.tel} />
        <Campo label="CONTACTO" valor={orden.contacto} />
        <Campo label="E-MAIL" valor={orden.email} />
        <Campo label="CONDICIÓN DE PAGO" valor={orden.pago} />
      </div>

      <div className="oc-sec">ENTREGA</div>
      <div className="oc-grid">
        <Campo label="LUGAR DE ENTREGA" valor={orden.lugar} />
        <Campo label="FECHA REQUERIDA" valor={orden.requerida ? fmtFecha(orden.requerida) : ""} />
        <Campo label="PLAZO OFRECIDO" valor={orden.plazo} />
        <Campo label="PRESUPUESTO N°" valor={orden.presupuesto} />
        <Campo label="MONEDA" valor={mon} />
        <Campo label="FLETE" valor={orden.flete} />
      </div>

      <div className="oc-sec">DETALLE DEL PEDIDO</div>
      <table className="oc-items">
        <thead>
          <tr>
            <th style={{ width: "5%" }}>ÍTEM</th>
            <th style={{ width: "13%" }}>CÓDIGO</th>
            <th>DESCRIPCIÓN</th>
            <th style={{ width: "11%" }}>U. MEDIDA</th>
            <th style={{ width: "10%" }}>CANTIDAD</th>
            <th style={{ width: "14%" }}>PRECIO UNIT.</th>
            <th style={{ width: "15%" }}>IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="c">{i + 1}</td>
              <td>{it.codigo}</td>
              <td>{it.descripcion}</td>
              <td className="c">{it.umedida}</td>
              <td className="c">{Number(it.cantidad || 0).toLocaleString("es-AR")}</td>
              <td className="d">{fmtMoneda(it.precio, mon)}</td>
              <td className="d">{fmtMoneda(Number(it.cantidad || 0) * Number(it.precio || 0), mon)}</td>
            </tr>
          ))}
          {Array.from({ length: vacias }).map((_, i) => (
            <tr key={`v${i}`} className="oc-vacia">
              <td className="c">{items.length + i + 1}</td>
              <td colSpan={6}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} />
            <td className="d oc-tot-lab">SUBTOTAL</td>
            <td className="d">{fmtMoneda(t.subtotal, mon)}</td>
          </tr>
          <tr>
            <td colSpan={5} />
            <td className="d oc-tot-lab">FLETE / OTROS</td>
            <td className="d">{fmtMoneda(t.flete, mon)}</td>
          </tr>
          <tr>
            <td colSpan={5} />
            <td className="d oc-tot-lab">
              IVA {(Number(orden.ivaPct || 0) * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
            </td>
            <td className="d">{fmtMoneda(t.iva, mon)}</td>
          </tr>
          <tr className="oc-total">
            <td colSpan={5} />
            <td className="d oc-tot-lab">TOTAL</td>
            <td className="d">{fmtMoneda(t.total, mon)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="oc-sec">OBSERVACIONES</div>
      <div className="oc-obs">{orden.obs || " "}</div>

      <div className="oc-firmas">
        <div>
          <div className="oc-firma-caja" />
          <div className="oc-firma-lab">SOLICITA — Sector solicitante</div>
        </div>
        <div>
          <div className="oc-firma-caja" />
          <div className="oc-firma-lab">AUTORIZA — Compras</div>
        </div>
        <div>
          <div className="oc-firma-caja" />
          <div className="oc-firma-lab">RECEPCIÓN CONFORME — fecha y aclaración</div>
        </div>
      </div>

      <ul className="oc-cond">
        {CONDICIONES.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
