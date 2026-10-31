// Screenshot mode. Shared state "privacy":
//   { on, hidden: ["space:<id>", "machine:<name>"], phrases: [{ text, alias }] }
// (a phrase may also be a plain string: no alias). An item is hidden when it is marked by
// hand, or when its name, title, folder, repo or branch contains a phrase (any case).
// When on, a hidden name whose matching phrases all have aliases shows with those swapped
// in ("top secret client name api" -> "bob api"). Otherwise, and always for items marked by hand,
// it shows a stand-in: "Space N", "Machine N", or a tab's program name.
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
// Every phrase as { text, alias } (alias "" when none).
export const phrases = () => state().phrases
  .map((p) => (typeof p === "string" ? { text: p, alias: "" } : { text: String(p?.text ?? ""), alias: String(p?.alias ?? "") }))
  .filter((p) => p.text.trim());

// Saves the list; a later entry for the same phrase (any case) replaces an earlier one.
export function setPhrases(list) {
  const byKey = new Map();
  for (const p of list) {
    const text = String(p?.text ?? p).trim();
    if (text) byKey.set(text.toLowerCase(), { text, alias: String(p?.alias ?? "").trim() });
  }
  setShared("privacy", { ...state(), phrases: [...byKey.values()] });
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
  const ps = phrases().map((p) => p.text.toLowerCase());
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

const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `text` with its phrases swapped for their aliases, or null when it contains no phrase or
// one without an alias (then only a stand-in hides it).
export function aliased(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  const hits = phrases().filter((p) => lower.includes(p.text.toLowerCase()));
  if (!hits.length || hits.some((p) => !p.alias)) return null;
  let out = String(text);
  for (const p of hits.sort((a, b) => b.text.length - a.text.length)) out = out.replace(new RegExp(escape(p.text), "gi"), p.alias);
  return out;
}

// Marked by hand (itself or its machine): the whole name goes, aliases or not.
const byHand = (w) => !!w && (isMarked(spaceKey(w.id)) || (!!w.machine && isMarked(machineKey(w.machine))));

// Stable stand-ins: position in the list, so a screenshot reads naturally.
export function spaceName(w) {
  if (!spaceMasked(w)) return w.name;
  return (!byHand(w) && aliased(w.name)) || `Space ${spaces().findIndex((x) => x.id === w.id) + 1}`;
}

export function machineName(name) {
  if (!machineMasked(name)) return name;
  if (!isMarked(machineKey(name))) { const a = aliased(name); if (a) return a; }
  const names = [...new Set(spaces().map((w) => w.machine).filter(machineHidden).concat(
    state().hidden.filter((k) => k.startsWith("machine:")).map((k) => k.slice(8)), [name]))].sort();
  return `Machine ${names.indexOf(name) + 1}`;
}

// Any text belonging to a tab (its name, a terminal's title or folder, a branch): as is when
// the tab isn't masked, aliased when it can be, else `fallback`.
export function tabText(tabId, text, fallback) {
  if (!tabMasked(tabId)) return text;
  if (byHand(spaceOfTab(tabId))) return fallback;
  return aliased(text) ?? fallback;
}

// Text that belongs to a space (its repo or branch).
export function spaceText(w, text, fallback) {
  if (!spaceMasked(w) && !(privacyOn() && matches(text))) return text;
  if (byHand(w)) return fallback;
  return aliased(text) ?? fallback;
}
