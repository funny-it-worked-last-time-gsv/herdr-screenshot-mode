// How long an agent's last turn ran and how long ago it ended, as "12 min / 3 min ago".
// The core keeps only when a terminal's status last changed (status_ms), so the start
// of a turn is remembered here when it is seen working (localStorage, per mod). A turn
// that ran while the app was closed has no start: it shows "3 min ago" alone.
import { terminals } from "herdr";

let turns = null;
const load = () => (turns ??= JSON.parse(localStorage.getItem("turns") ?? "{}"));
const save = () => localStorage.setItem("turns", JSON.stringify(turns));

export function span(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

// { working, ran, ago } in ms for an agent (any may be null), or null when unknown.
export function turn(address, now = Date.now()) {
  const k = terminals().find((x) => x.address === address);
  const at = k?.status_ms;
  if (!at) return null;
  const all = load();
  const state = k.status?.state ?? k.status;
  const t = all[address];
  if (state === "working") {
    if (t?.start !== at) { all[address] = { start: at }; save(); }
    return { working: now - at, ran: null, ago: null };
  }
  // The first look after it stopped fixes the end: looking at a done agent makes it
  // idle, which moves status_ms again.
  if (t?.start && !t.end) { t.end = at; save(); }
  const end = t?.end ?? at;
  return { working: null, ran: t?.end ? t.end - t.start : null, ago: now - end };
}

// A shell's last command, from the labels screenshot-mode/last-command.zsh sets.
export function command(labels, now = Date.now()) {
  const start = Number(labels?.cmd_start), end = Number(labels?.cmd_end);
  if (!start) return null;
  return end ? { working: null, ran: end - start, ago: now - end } : { working: now - start, ran: null, ago: null };
}

// "12 min" while it runs, "12 min / 3 min ago" after, "3 min ago" without a start.
export function label(t) {
  if (!t) return "";
  if (t.working != null) return span(t.working);
  return t.ran != null ? `${span(t.ran)} / ${span(t.ago)} ago` : `${span(t.ago)} ago`;
}

// Forget agents that are gone for a month.
export function prune(live, now = Date.now()) {
  const all = load();
  let dirty = false;
  for (const [a, t] of Object.entries(all)) if (!live.has(a) && now - (t.end ?? t.start) > 30 * 86400000) { delete all[a]; dirty = true; }
  if (dirty) save();
}
