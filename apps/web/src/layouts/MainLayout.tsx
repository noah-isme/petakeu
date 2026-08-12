import { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";

const navLinks = [
  { to: "/map", label: "Peta Heatmap" },
  { to: "/admin/audit", label: "Audit Trail" }
];

export function MainLayout({ children }: PropsWithChildren) {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Petakeu • Peta Interaktif Pemasukan Daerah</h1>
        <nav className="app-nav">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to} className={pathname === link.to ? "active" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="app-content">{children}</main>
    </div>
  );
}
