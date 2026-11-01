// A sidebar section that folds down to its header and can switch to dense rows.
// Folding shrinks the layout block holding this mod (found by its mod name) to its
// `min`, so the room goes to the blocks around it; unfolding puts back the size it
// had. The block's `min` in the layout must be the header's height.
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

// Folding gives the block weight 0, so the layout's own `min` (the header's height)
// holds it. A fixed px size didn't stay put: other blocks resizing could undo it.
const isFolded = (size) => size?.weight === 0;

export function toggleFold(mod) {
  const b = block(mod);
  if (!folded()) {
    if (b) {
      set("section.size", JSON.stringify(isFolded(b.size) || b.size?.px ? { weight: 1 } : b.size ?? { weight: 1 }));
      run("layout.resize", { id: b.id, weight: 0 });
    }
    set("section.folded", "1");
  } else {
    if (b) run("layout.resize", { id: b.id, ...JSON.parse(get("section.size") ?? '{"weight":1}') });
    set("section.folded", "0");
  }
}

// Folded but shown bigger (the app started again, or the layout changed): fold the
// block again. At most once a second, in case the layout won't take it.
let tried = 0;
export function keepFolded(mod) {
  if (!folded() || Date.now() - tried < 1000) return;
  const b = block(mod);
  if (!b || isFolded(b.size)) return;
  tried = Date.now();
  run("layout.resize", { id: b.id, weight: 0 });
}
