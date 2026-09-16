// Listas y datos fijos de las órdenes de compra del pilar Flota (Misiones).
// Si cambia la flota o se agrega un rubro, se edita ACÁ.

export const EMISOR = {
  razon: "MERCOSUR DISTRIBUCIONES",
  cuit: "30-70774836-9",
  sector: "Pilar Flota — Misiones",
  domicilio: "Depósito Eldorado / Iguazú",
  tel: "3751-587188",
  email: "haguero@mercosurdistribuciones.com.ar",
};

// FLOTA QUILMES ACTUALIZADA: 16 camiones + 2 acoplados + 3 autoelevadores.
export const FLOTA = [
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
  { value: "TOYOTA4", label: "TOYOTA4 (autoelevador)" },
  { value: "TOYOTA5", label: "TOYOTA5 (autoelevador)" },
  { value: "TOYOTA6", label: "TOYOTA6 (autoelevador)" },
  { value: "STOCK TALLER", label: "Stock taller (sin unidad)" },
  { value: "NO APLICA", label: "No aplica" },
];
export function etiquetaUnidad(value) {
  const u = FLOTA.find((x) => x.value === value);
  return u ? u.label : value || "—";
}

export const SUCURSALES = ["Eldorado", "Iguazú"];
export const PRIORIDADES = ["Normal", "Urgente", "Unidad parada"];
export const RUBROS = [
  "Repuestos",
  "Neumáticos",
  "Lubricantes y fluidos",
  "Servicio / Mano de obra",
  "Chapa y pintura",
  "Electricidad",
  "Herramientas",
  "Insumos de taller",
  "Seguridad (matafuegos, botiquín)",
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
  "4. Los repuestos que quedan en el taller se cargan como ingreso en Gestión de repuestos, imputados a la unidad.",
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
