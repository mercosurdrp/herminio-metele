"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/flota", label: "📋 Check List" },
  { href: "/estandar", label: "📐 Estándar" },
  { href: "/mantenimiento-flota", label: "🛠️ Mantenimiento" },
  { href: "/combustible", label: "⛽ Combustible" },
  { href: "/repuestos", label: "📦 Gestión de repuestos" },
  { href: "/mantenimiento", label: "🔧 Análisis de falla mecánica" },
];

// Barra superior compartida: marca + pestañas. `children` = acciones de la
// derecha propias de cada página (ej. botón Sincronizar).
export default function Nav({ children }) {
  const path = usePathname();
  return (
    <div className="marco-cabecera">
    <div className="work-title">
      <img className="wt-logo" src="/logo-mercosur-distri.svg" alt="Mercosur Distribuciones" />
      <span className="wt-text">FLOTA</span>
      <img className="wt-logo wt-logo-dpo" src="/logo-dpo.jpeg" alt="DPO" />
    </div>
    <div className="topbar">
      <div className="nav-wrap">
        <span className="brand">Mercosur Misiones</span>
        <nav className="nav-tabs">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`tab${path === t.href ? " active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children && <div className="topbar-actions">{children}</div>}
    </div>
    </div>
  );
}
