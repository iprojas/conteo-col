import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const alt = "Conteo Cívico — revisión ciudadana de actas electorales";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#f4f1e8",
          color: "#152c24",
          fontFamily: "Arial, sans-serif",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: 260,
            right: -110,
            top: -90,
            background: "#f2c94c",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: 330,
            height: 330,
            borderRadius: 165,
            right: 90,
            bottom: -165,
            background: "#2f785f",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 860,
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 58,
                height: 58,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 29,
                background: "#2f785f",
                color: "white",
                fontSize: 38,
                fontWeight: 700,
              }}
            >
              ✓
            </div>
            <div style={{ display: "flex", fontSize: 35, fontWeight: 700 }}>{SITE_NAME}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", color: "#2f785f", fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>
              CONTEO CIUDADANO · COLOMBIA
            </div>
            <div style={{ display: "flex", fontSize: 67, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }}>
              Defendamos cada voto.
            </div>
            <div style={{ display: "flex", width: 780, color: "#42564e", fontSize: 29, lineHeight: 1.35 }}>
              {SITE_DESCRIPTION}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#2f785f", fontSize: 25, fontWeight: 700 }}>
            conteocol.com <span style={{ display: "flex" }}>→</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
