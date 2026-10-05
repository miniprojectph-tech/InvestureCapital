// Name masking for the Masterlist — shared by Cloud Functions and the app
// (src/lib/maskName.ts is an identical copy; keep them in sync).
//
//   Maria Santos         →  Mar** S****s
//   Maria Clara Santos   →  Mar** Cla** S****s
//   Ana Uy               →  A** U*
//   Pedro Dela Cruz      →  Ped** Del* C**z
//   Juan Santos Jr.      →  Jua* S****s Jr.
//
// Rules (agreed with the owner):
//   * given names (every word except the last): first 3 letters shown, the rest starred;
//     a given name of 3 letters or fewer shows only its first letter
//   * surname (the last word): first and last letter shown, stars between;
//     a surname of 2 letters or fewer shows only its first letter
//   * a single-word name is treated as a given name
//   * Jr. / Sr. / II / III / IV are kept as written
//   * the number of stars matches the hidden letters, and there is always at least one

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);

// Count real characters (so "ñ" and accented letters are one each).
const chars = (s: string) => Array.from(s);
const stars = (n: number) => "*".repeat(Math.max(1, n));

function maskGiven(word: string): string {
  const c = chars(word);
  if (c.length <= 3) return c[0] + stars(c.length - 1);
  return c.slice(0, 3).join("") + stars(c.length - 3);
}

function maskSurname(word: string): string {
  const c = chars(word);
  if (c.length <= 2) return c[0] + stars(c.length - 1);
  return c[0] + stars(c.length - 2) + c[c.length - 1];
}

export function maskName(fullName: string): string {
  const words = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Member";

  // Peel "Jr." and the like off the end; they are not part of the surname.
  const tail: string[] = [];
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1].toLowerCase())) tail.unshift(words.pop() as string);

  if (words.length === 1) return [maskGiven(words[0]), ...tail].join(" ");
  const surname = words[words.length - 1];
  return [...words.slice(0, -1).map(maskGiven), maskSurname(surname), ...tail].join(" ");
}
