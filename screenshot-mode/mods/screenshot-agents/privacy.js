// Screenshot mode. Shared state "privacy": { on, hidden: ["space:<id>", "machine:<name>"] }.
// When on, any space marked hidden (or living on a hidden machine) shows as "Space N",
// its tabs as "Tab N", its agents and pane titles/folders are masked, and hidden
// machines show as "Machine N". Every mod that draws a name imports this.

import { shared, setShared, spaces } from "herdr";

const state = () => {
  const s = shared("privacy");
  return { on: !!s?.on, hidden: Array.isArray(s?.hidden) ? s.hidden : [] };
};

export const privacyOn = () => state().on;
export const isMarked = (key) => state().hidden.includes(key);
export const spaceKey = (id) => `space:${id}`;
export const machineKey = (name) => `machine:${name}`;

export function toggleMarked(key) {
  const s = state();
  const hidden = s.hidden.includes(key) ? s.hidden.filter((k) => k !== key) : [...s.hidden, key];
  setShared("privacy", { ...s, hidden });
}

export function togglePrivacy() {
  const s = state();
  setShared("privacy", { ...s, on: !s.on });
}

export function machineMasked(name) {
  const s = state();
  return s.on && !!name && s.hidden.includes(machineKey(name));
}

// A space object, or a space id.
export function spaceMasked(sp) {
  const s = state();
  if (!s.on || !sp) return false;
  const w = typeof sp === "string" ? spaces().find((x) => x.id === sp) : sp;
  if (!w) return s.hidden.includes(spaceKey(sp));
  return s.hidden.includes(spaceKey(w.id)) || machineMasked(w.machine);
}

export const spaceOfTab = (tabId) => spaces().find((w) => (w.tabs ?? []).some((t) => t.id === tabId));
export const tabMasked = (tabId) => spaceMasked(spaceOfTab(tabId));

// Stable stand-ins: position in the list, so a screenshot reads naturally.
export function spaceName(w) {
  if (!spaceMasked(w)) return w.name;
  return `Space ${spaces().findIndex((x) => x.id === w.id) + 1}`;
}

export function machineName(name) {
  if (!machineMasked(name)) return name;
  const names = state().hidden.filter((k) => k.startsWith("machine:")).map((k) => k.slice(8)).sort();
  return `Machine ${names.indexOf(name) + 1}`;
}

export function tabName(tabId, real) {
  const w = spaceOfTab(tabId);
  if (!spaceMasked(w)) return real;
  return `Tab ${(w.tabs ?? []).findIndex((t) => t.id === tabId) + 1}`;
}
