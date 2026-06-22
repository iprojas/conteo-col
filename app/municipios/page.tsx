import Link from "next/link";
import { MunicipalityList } from "@/components/municipality-list";
import { getMunicipalities } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MunicipalitiesPage() {
  const municipalities = await getMunicipalities();
  const pending = municipalities.reduce((total, item) => total + item.pending, 0);

  return (
    <main className="page-shell narrow">
      <Link className="back-link" href="/">← Inicio</Link>
      <section className="municipalities-header">
        <p className="eyebrow">PARTICIPA EN EL CONTEO CÍVICO</p>
        <h1>Elige un municipio</h1>
        <p>
          Hay {pending.toLocaleString("es-CO")} actas pendientes. Selecciona un municipio
          para comenzar a evaluarlas.
        </p>
      </section>
      <MunicipalityList municipalities={municipalities} title="Todos los municipios" />
    </main>
  );
}
