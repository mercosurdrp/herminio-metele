// Listas y datos fijos de las órdenes de compra (uso corporativo).
// Si se agrega un sector o un rubro, se edita ACÁ.

export const EMISOR = {
  razon: "MERCOSUR DISTRIBUCIONES",
  cuit: "30-70774836-9",
  domicilio: "Eldorado / Iguazú, Misiones",
  tel: "3751-587188",
  email: "haguero@mercosurdistribuciones.com.ar",
};

export const SECTORES = [
  "Administración",
  "Compras",
  "Depósito",
  "Distribución",
  "Flota",
  "Gerencia",
  "Mantenimiento",
  "RR.HH.",
  "Seguridad e Higiene",
  "Sistemas",
  "Ventas",
];

export const SUCURSALES = ["Eldorado", "Iguazú"];
export const PRIORIDADES = ["Normal", "Urgente", "Crítica"];
export const RUBROS = [
  "Insumos de oficina y librería",
  "Limpieza e higiene",
  "Seguridad e higiene (EPP)",
  "Informática y telefonía",
  "Mobiliario y equipamiento",
  "Herramientas",
  "Ropa de trabajo",
  "Repuestos y mantenimiento",
  "Servicio / Mano de obra",
  "Construcción / obra",
  "Fletes y logística",
  "Publicidad y merchandising",
  "Otros",
];
export const PAGOS = ["Contado", "7 días", "15 días", "30 días", "60 días", "Cuenta corriente"];
export const UMEDIDAS = ["Unidad", "Juego", "Par", "Litro", "Kg", "Metro", "Hora", "Servicio", "Global"];
export const MONEDAS = ["ARS", "USD"];
export const IVAS = [
  { value: 0.21, label: "21%" },
  { value: 0.105, label: "10,5%" },
  { value: 0, label: "0% (exento)" },
];

export const ESTADOS = [
  { value: "emitida", label: "Emitida", color: "#2563eb" },
  { value: "aprobada", label: "Aprobada", color: "#7c3aed" },
  { value: "enviada", label: "Enviada al proveedor", color: "#0d9488" },
  { value: "recibida_parcial", label: "Recibida parcial", color: "#d97706" },
  { value: "recibida", label: "Recibida", color: "#16a34a" },
  { value: "facturada", label: "Facturada", color: "#0f766e" },
  { value: "anulada", label: "Anulada", color: "#6b7280" },
];
export function estadoInfo(value) {
  return ESTADOS.find((e) => e.value === value) || ESTADOS[0];
}
// Una orden está "abierta" mientras no se facturó ni se anuló.
export const ESTADOS_ABIERTOS = new Set(["emitida", "aprobada", "enviada", "recibida_parcial"]);

export const CONDICIONES = [
  "1. El remito y la factura del proveedor deben citar el N° de esta orden de compra. Sin OC no se autoriza el pago.",
  "2. No se recibe mercadería sin remito. La recepción se controla contra esta orden: cantidad, descripción y precio.",
  "3. Toda diferencia de precio, cantidad o plazo debe informarse ANTES de despachar y quedar registrada en Observaciones.",
  "4. Lo recibido se imputa al sector / centro de costo indicado en esta orden.",
  "5. Esta orden vence a los 30 días de emitida si no fue entregada; pasado ese plazo se emite una nueva.",
];

export function hoyArg() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function fmtFecha(iso) {
  if (!iso || iso.length < 10) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
export function fmtMoneda(n, moneda = "ARS") {
  const v = Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === "USD" ? `US$ ${v}` : `$ ${v}`;
}
// Mismos totales que calcula el servidor (para mostrarlos mientras se carga).
export function totales(orden) {
  const subtotal =
    Math.round(
      (orden.items || []).reduce((a, it) => a + Math.round(Number(it.cantidad || 0) * Number(it.precio || 0) * 100) / 100, 0) * 100
    ) / 100;
  const flete = Number(orden.fleteOtros || 0);
  const iva = Math.round((subtotal + flete) * Number(orden.ivaPct || 0) * 100) / 100;
  return { subtotal, flete, iva, total: Math.round((subtotal + flete + iva) * 100) / 100 };
}
