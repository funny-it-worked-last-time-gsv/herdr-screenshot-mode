// A sidebar section that folds down to its header and can switch to dense rows.
// Folding resizes the layout block holding this mod (found by its mod name), so the
// room goes to the blocks around it; unfolding puts back the size it had. The block's
// `min` in the layout must allow the header's height, or it stops there.
import { layout, run } from "herdr";

function findBy(node, ok) {
  if (node && ok(node)) return node;
  for (const child of node?.children ?? []) {
    const found = findBy(child, ok);
    if (found) return found;
  }
  return null;
}

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export const block = (mod) => findBy(layout(), (n) => n.content?.mod === mod);
export const folded = () => get("section.folded") === "1";
export const dense = () => get("section.dense") === "1";
export const toggleDense = () => set("section.dense", dense() ? "0" : "1");

export function toggleFold(mod, headerPx) {
  const b = block(mod);
  if (!folded()) {
    if (b) {
      set("section.size", JSON.stringify(b.size?.px === headerPx ? { weight: 1 } : b.size ?? { weight: 1 }));
      run("layout.resize", { id: b.id, px: headerPx });
    }
    set("section.folded", "1");
  } else {
    if (b) run("layout.resize", { id: b.id, ...JSON.parse(get("section.size") ?? '{"weight":1}') });
    set("section.folded", "0");
  }
}

// Folded but shown at full size (the app started again): fold the block again, once.
let checked = false;
export function keepFolded(mod, headerPx) {
  if (checked || !folded()) return;
  const b = block(mod);
  if (!b) return;
  checked = true;
  if (b.size?.px !== headerPx) run("layout.resize", { id: b.id, px: headerPx });
}
