/**
 * Normaliza nombres personales para mostrarlos y guardarlos con una
 * capitalización legible: "ALFREDO PEREZ" -> "Alfredo Perez".
 * Conserva acentos y capitaliza después de espacios, guiones y apóstrofes.
 */
export const normalizePersonName = (value: unknown): string => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");

  return normalized.replace(
    /(^|[\s\-'’.\/])\p{L}/gu,
    (fragment) => fragment.toLocaleUpperCase("es"),
  );
};
