"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/flota", label: "🚛 Flota" },
  { href: "/mantenimiento", label: "🔧 Análisis de falla mecánica" },
];

// Barra superior compartida: marca + pestañas. `children` = acciones de la
// derecha propias de cada página (ej. botón Sincronizar).
export default function Nav({ children }) {
  const path = usePathname();
  return (
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
  );
}
