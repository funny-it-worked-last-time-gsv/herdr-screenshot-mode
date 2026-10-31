// Screenshot mode. Shared state "privacy": { on, hidden: ["space:<id>", "machine:<name>"], phrases: [] }.
// An item is hidden when it is marked by hand, or when its name, title, folder, repo or
// branch contains one of the phrases (any case). When on, hidden spaces show as "Space N",
// hidden machines as "Machine N", and hidden tabs/terminals show their program name.
// Every mod that draws a name has an identical copy of this file.

import { shared, setShared, spaces, panes } from "herdr";

const state = () => {
  const s = shared("privacy");
  return {
    on: !!s?.on,
    hidden: Array.isArray(s?.hidden) ? s.hidden : [],
    phrases: Array.isArray(s?.phrases) ? s.phrases : [],
  };
};

export const privacyOn = () => state().on;
export const isMarked = (key) => state().hidden.includes(key);
export const spaceKey = (id) => `space:${id}`;
export const machineKey = (name) => `machine:${name}`;
export const phrases = () => state().phrases;

export function setPhrases(list) {
  const clean = [...new Set(list.map((p) => String(p).trim()).filter(Boolean))];
  setShared("privacy", { ...state(), phrases: clean });
}

export function toggleMarked(key) {
  const s = state();
  const hidden = s.hidden.includes(key) ? s.hidden.filter((k) => k !== key) : [...s.hidden, key];
  setShared("privacy", { ...s, hidden });
}

export function togglePrivacy() {
  const s = state();
  setShared("privacy", { ...s, on: !s.on });
}

// Does any text contain a phrase? Case-insensitive substring.
export function matches(...texts) {
  const ps = state().phrases.map((p) => p.toLowerCase());
  if (!ps.length) return false;
  return texts.some((t) => t && ps.some((p) => String(t).toLowerCase().includes(p)));
}

// The "would hide" checks ignore whether the mode is on (the sidebar shows them while off).
export const machineHidden = (name) => !!name && (isMarked(machineKey(name)) || matches(name));

const resolve = (sp) => (typeof sp === "string" ? spaces().find((x) => x.id === sp) : sp);

export function spaceHidden(sp) {
  const w = resolve(sp);
  if (!w) return typeof sp === "string" && isMarked(spaceKey(sp));
  return isMarked(spaceKey(w.id)) || machineHidden(w.machine) || matches(w.name, w.folder);
}

export const spaceOfTab = (tabId) => spaces().find((w) => (w.tabs ?? []).some((t) => t.id === tabId));

// A tab is hidden with its space, or when its name or any terminal in it (title, folder,
// branch) matches a phrase.
export function tabHidden(tabId) {
  const w = spaceOfTab(tabId);
  if (spaceHidden(w)) return true;
  const tab = (w?.tabs ?? []).find((t) => t.id === tabId);
  if (tab && matches(tab.name)) return true;
  return panes().some((p) => p.tab === tabId && matches(p.title, p.cwd, p.branch));
}

// What the mods use: hidden AND the mode is on.
export const machineMasked = (name) => privacyOn() && machineHidden(name);
export const spaceMasked = (sp) => privacyOn() && spaceHidden(sp);
export const tabMasked = (tabId) => privacyOn() && tabHidden(tabId);

// Stable stand-ins: position in the list, so a screenshot reads naturally.
export function spaceName(w) {
  if (!spaceMasked(w)) return w.name;
  return `Space ${spaces().findIndex((x) => x.id === w.id) + 1}`;
}

export function machineName(name) {
  if (!machineMasked(name)) return name;
  const names = [...new Set(spaces().map((w) => w.machine).filter(machineHidden).concat(
    state().hidden.filter((k) => k.startsWith("machine:")).map((k) => k.slice(8)), [name]))].sort();
  return `Machine ${names.indexOf(name) + 1}`;
}
