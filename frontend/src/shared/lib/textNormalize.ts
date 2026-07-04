const DIACRITICS_REGEX = /\p{Diacritic}/gu;

/** Lowercase + strip diacritics + ё→е for consistent partial search. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/ё/g, "е");
}