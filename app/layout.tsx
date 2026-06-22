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
            <span className="brand-mark">✓</span>
            <span>Revisión de actas</span>
          </Link>
          <span className="header-note">Segunda vuelta · Colombia 2026</span>
        </header>
        {children}
      </body>
    </html>
  );
}
