// A space's avatar color (shared "space.colors", the same in every mod that draws
// spaces) as "#rrggbb", or null when it can't be told, so callers keep their plain look.
import { shared, theme } from "herdr";

const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

export function spaceColor(id, t = theme()) {
  const c = (shared("space.colors") ?? {})[id] ?? "ansi6";
  const v = c.startsWith("#") ? c : MARK[c] ?? t[c];
  return /^#[0-9a-f]{6}$/i.test(v ?? "") ? v : null;
}

// The color at an alpha given as two hex digits ("14" is about 8%), or null.
export const tint = (color, alpha) => (color ? color + alpha : null);
