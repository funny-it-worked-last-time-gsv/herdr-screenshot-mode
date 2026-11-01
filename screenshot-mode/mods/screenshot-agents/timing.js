// How long an agent's last turn ran and how long ago it ended, as "12 min / 3 min ago".
// Timed from what this mod sees: a turn starts when the agent turns working and ends
// when it stops. (The core's status_ms isn't kept current in terminals(), so it can't
// be used.) Kept in localStorage per mod; an agent not yet seen working has no timing.
let turns = null;
const load = () => (turns ??= JSON.parse(localStorage.getItem("turn-times") ?? "{}"));
const save = () => localStorage.setItem("turn-times", JSON.stringify(turns));

export function span(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

// { working, ran, ago } in ms for an agent with this status now, or null when unknown.
export function turn(address, status, now = Date.now()) {
  const all = load();
  let t = all[address];
  const working = status === "working";
  if (working && !t?.working) { t = all[address] = { start: now, working: true }; save(); }
  else if (!working && t?.working) { t.end = now; t.working = false; save(); }
  if (!t) return null;
  return t.working ? { working: now - t.start, ran: null, ago: null } : { working: null, ran: t.end - t.start, ago: now - t.end };
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
