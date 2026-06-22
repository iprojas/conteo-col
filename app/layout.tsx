import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revisión de actas",
  description: "Plataforma ciudadana para comparar actas electorales",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Ir al inicio">
            <span className="brand-mark" aria-hidden>✓</span>
            <span>Conteo Cívico</span>
          </Link>
          <nav className="main-nav" aria-label="Navegación principal">
            <Link href="/">Inicio</Link>
            <Link href="/municipios">Municipios</Link>
            <Link href="/#avance">Avance</Link>
          </nav>
          <div className="header-actions">
            <span className="header-note">Segunda vuelta · Colombia 2026</span>
            <Link className="header-cta" href="/revisar">Evaluar un acta <span aria-hidden>→</span></Link>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div>
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden>✓</span><span>Conteo Cívico</span></Link>
            <p>Una herramienta ciudadana para comparar actas electorales públicas.</p>
          </div>
          <nav aria-label="Navegación del pie">
            <Link href="/municipios">Municipios</Link>
            <Link href="/revisar">Evaluar un acta</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
