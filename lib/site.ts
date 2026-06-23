const DEFAULT_SITE_URL = "https://conteocol.com";

export const SITE_NAME = "Conteo Cívico";
export const SITE_TITLE = "Conteo Cívico | Revisión ciudadana de actas";
export const SITE_DESCRIPTION =
  "Compara actas electorales públicas y ayuda a identificar inconsistencias para defender cada voto.";

function getSiteUrl() {
  const configuredUrl = process.env.SITE_URL?.trim() || DEFAULT_SITE_URL;

  try {
    const url = new URL(configuredUrl);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    throw new Error(`SITE_URL no es una URL válida: ${configuredUrl}`);
  }
}

export const SITE_URL = getSiteUrl();
