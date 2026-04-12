/**
 * Normalize user input to 10-digit Indian mobile (local part, leading digit 6–9).
 */
export function normalizeIndianMobileTo10(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  let n = digits;
  if (n.length === 12 && n.startsWith("91")) {
    n = n.slice(2);
  }
  if (n.length === 11 && n.startsWith("0")) {
    n = n.slice(1);
  }
  if (n.length !== 10 || !/^[6-9]\d{9}$/.test(n)) {
    return null;
  }
  return n;
}
