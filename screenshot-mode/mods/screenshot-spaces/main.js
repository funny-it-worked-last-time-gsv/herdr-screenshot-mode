// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, machines, panes, agents, terminals, knownAgents, keys, settings, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, nextCommand, props, closeOverlay } from "herdr";
import { privacyOn, isMarked, toggleMarked, togglePrivacy, spaceKey, machineKey, spaceMasked, spaceName, machineName, spaceHidden, machineHidden, phrases, setPhrases, spaceText, tabText } from "./privacy.js";
import { turn, command, label as turnLabel } from "./timing.js";
import { folded, dense, toggleFold, toggleDense, keepFolded } from "./section.js";
import { spaceColor, tint } from "./colors.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
// Dense: tighter rows and no tabs listed under spaces.
const rowHeight = ({ tree }) => (dense() ? 24 : tree ? 28 : 30);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

// A global key binding as people read it ("⌘T"), or "".
function shortcut(name) {
  const k = keys().find(b => b.section === "global" && b.action === name);
  if (!k?.keys.trim()) return "";
  const mac = window()?.platform === "macos";
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return k.keys.trim().split(/\s+/).map(stroke => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map(m => alias[m.toLowerCase()] ?? m.toLowerCase()));
    if (/^[A-Z]$/.test(key)) held.add("shift");
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...Object.keys(names).filter(m => held.has(m)).map(m => names[m]), label].join(mac ? "" : "+");
  }).join(" ");
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    if (props()?.phrases) return this.initEditor(cx);
    if (props()?.newMenu) return this.initNewMenu(cx);
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
    this.hoverRow = null;
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "privacy") { togglePrivacy(); cx.notify(); } } });
  }

  // Eye button that marks a space or machine as hidden in screenshot mode. Shown on
  // hover, and always (dim) while marked so you can see what will be masked.
  // `hidden`: marked by hand or matched by a phrase. A phrase match can't be unmarked
  // here, so clicking it opens the phrase list instead.
  eye(id, key, hidden, t) {
    const marked = isMarked(key);
    if (this.hoverRow !== id && !(hidden && !privacyOn())) return null;
    return div().id(`eye-${id}`).flex_none().p(2).rounded(4).text_color(hidden ? t.accent : t.dim)
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); hidden && !marked ? this.openEditor() : toggleMarked(key); cx.notify(); })
      .child(svg(`mods/screenshot-spaces/${hidden ? "eye-off" : "eye"}.svg`).size(12));
  }

  openEditor() {
    openOverlay({ mod: "screenshot-spaces", kind: "dialog", width: 380, height: 420, props: { phrases: true } });
  }

  // The phrase list dialog (this mod opened as an overlay with { phrases: true }).
  initEditor(cx) {
    this.input = InputState.new({ value: "", placeholder: "Phrase to hide" });
    this.alias = InputState.new({ value: "", placeholder: "Alias (optional)" });
    // Enter in either box adds the phrase; adding one that exists replaces its alias.
    const add = (_e, cx) => {
      const text = this.input.value().trim();
      if (text) setPhrases([...phrases(), { text, alias: this.alias.value().trim() }]);
      this.input.set_value("");
      this.alias.set_value("");
      this.input.focus();
      cx.notify();
    };
    this.input.on("submit", add);
    this.alias.on("submit", add);
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  editor() {
    const t = theme();
    const list = phrases();
    const done = () => closeOverlay(props().overlay);
    const box = (state, accent) => Input.new(state).h(34).px(10).rounded(8).border_1().border_color(accent ? t.accent : t.input).bg(t.background).text_size(12.8);
    return v_flex().id("phrases").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { done(); cx.stop_propagation(); } })
      .size_full().min_h(0).p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(12.5)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().child("Hide phrases"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().text_size(11.5).text_color(t.muted).child("In screenshot mode, any space, machine, tab or terminal whose name, title, folder, repo or branch contains one of these (any case) is hidden."))
      .child(div().text_size(11.5).text_color(t.muted).child("With an alias, the phrase is swapped for it (\"top secret client name\" shows as \"bob\"). Without one, the name becomes \"Space 2\" or similar. Click a phrase to edit it."))
      .child(h_flex().gap(8).child(div().flex_1().child(box(this.input, true))).child(div().w(140).flex_none().child(box(this.alias, false))))
      .child(v_flex().id("phrase-list").flex_none().h(Math.min(Math.max(list.length, 1) * 30, 220)).gap(2).overflow_y_scrollbar()
        .when(!list.length, el => el.child(div().py(6).text_color(t.dim).child("No phrases yet.")))
        .children(list.map((ph, i) => h_flex().id(`ph-${i}`).h(28).px(8).gap(8).items_center().rounded(6).bg(t.raised)
          .cursor_pointer().hover(s => s.bg(t.hover))
          .on_click((_e, cx) => { this.input.set_value(ph.text); this.alias.set_value(ph.alias); this.alias.focus(); cx.notify(); })
          .child(div().flex_1().min_w(0).truncate().child(ph.text))
          .child(div().max_w(150).truncate().text_color(ph.alias ? t.muted : t.dim).child(ph.alias ? `\u2192 ${ph.alias}` : "no alias"))
          .child(div().id(`ph-x-${i}`).p(3).rounded(4).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); setPhrases(list.filter((_, j) => j !== i)); cx.notify(); })
            .child(svg("mods/workspace-chrome/x.svg").size(12))))))
      .child(h_flex().justify_end().child(h_flex().id("ph-done").h(32).px(14).items_center().rounded(8)
        .bg(t.solid).text_color(t.solid_foreground).font_medium().cursor_pointer().hover(s => s.opacity(0.88))
        .on_click(() => done()).child("Done")));
  }

  hovering(id) {
    return (h, cx) => { if (h) this.hoverRow = id; else if (this.hoverRow === id) this.hoverRow = null; cx.notify(); };
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  // The new menu (Terminal, agents, new space, worktrees) for space `w`. From a
  // right-click it also has that space's own items: rename, remove worktree, close.
  menu(w, own = true) {
    const linked = Boolean(this.git[where(w, panes())]?.linked);
    const remotes = this.targets().filter(Boolean);
    openOverlay({ mod: "screenshot-spaces", kind: "popup", width: 250, height: 620, props: { newMenu: true, space: w.id, own, linked, remotes } });
  }

  // The menu itself (this mod opened as an overlay with { newMenu: true }).
  initNewMenu(cx) {
    this.agents = [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    const on = spaces().find(s => s.id === props().space)?.machine;
    cx.spawn(async cx => {
      try { this.agents = await knownAgents({ on }); } catch { this.failed = true; }
      cx.notify();
    });
  }

  newMenu() {
    const t = theme();
    const p = props();
    const space = spaces().find(s => s.id === p.space);
    const id = space?.id;
    const done = () => closeOverlay(p.overlay);
    const installed = this.agents.filter(a => a.installed);
    const choices = [...installed, ...this.agents.filter(a => !a.installed).slice(0, 2)];
    const folder = panes().find(x => x.focused && space?.tabs.some(c => c.id === x.tab))?.cwd;
    const worktree = (action, width, height) => () => openOverlay({ mod: "worktree", kind: "dialog", width, height, props: { space: id, folder, action } });
    const row = (key, icon, name, action, hint = "", enabled = true) => h_flex().id(key).h(31).px(9).gap(10).rounded(7).items_center().flex_none()
      .text_color(enabled ? t.foreground : t.dim).when(enabled, el => el.hover(s => s.bg(t.selected)))
      .on_click(() => { if (enabled) { done(); action(); } })
      .child(icon).child(div().flex_1().min_w(0).truncate().child(name)).child(div().text_size(11).text_color(t.dim).child(hint));
    const icon = (path) => svg(`mods/workspace-chrome/${path}.svg`).size(14).text_color(t.muted);
    const line = () => div().h(1).mx(4).my(5).bg(t.border).flex_none();
    const start = (a) => run("tab.new", { name: a.name, space: id, argv: a.run });
    return v_flex().id("new-menu").track_focus(this.handle).w_full().min_h(0).bg(t.popover).p(5).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { done(); return cx.stop_propagation(); }
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const a = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (a) { done(); start(a); }
      })
      .when(p.own && Boolean(space), el => el
        .child(div().px(9).pt(4).pb(4).text_size(11).text_color(t.dim).truncate().child(spaceName(space)))
        .child(row("rename", icon("square-pen"), "Rename", () => run("space.rename", { id })))
        // The space's color: shared "space.colors", read by every mod that draws spaces.
        // The menu stays open so colors can be tried.
        .child(h_flex().h(30).px(9).gap(8).items_center().flex_none()
          .children(Object.entries(MARK).map(([name, hex]) => {
            const on = ((shared("space.colors") ?? {})[id] ?? "ansi6") === name;
            return div().id(`color-${name}`).size(18).flex_none().rounded(9).cursor_pointer().bg(hex)
              .border(2).border_color(on ? t.foreground : t.popover)
              .hover(s => s.border_color(t.muted))
              .on_click((_e, cx) => { setShared("space.colors", { ...(shared("space.colors") ?? {}), [id]: name }); cx.notify(); });
          })))
        .child(line()))
      .child(row("terminal", svg("icons/shell.svg").size(14), "Terminal", () => run("tab.new", { space: id }), shortcut("tab.new")))
      .child(div().px(9).pt(8).pb(4).text_size(11).text_color(t.dim).child("Start an agent"))
      // At most 8 rows (6 with the space's own items), then it scrolls: a long agent list must not push the space's items out of the popup.
      .child(v_flex().id("agent-list").flex_none().h(Math.min(choices.length, p.own ? 6 : 8) * 31).overflow_y_scrollbar()
        .children(choices.map((a, i) => row(`agent-${a.key}`, a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14), a.name,
          () => start(a), a.installed ? (i < 9 ? String(i + 1) : "") : "not installed", a.installed))))
      .when(this.agents.length === 0, el => el.child(div().px(9).py(6).text_color(t.dim).child(this.failed ? "Could not load agents" : "Checking installed agents\u2026")))
      .child(line())
      .child(row("space", icon("plus"), "New space", () => run("space.new"), shortcut("space.new")))
      .children(p.remotes.map(m => row(`space-${m}`, icon("server"), `New space on ${machineName(m)}`, () => run("space.new", { machine: m }))))
      .child(row("worktree", icon("branch"), "New worktree\u2026", worktree("new", 460, 280), "", Boolean(space)))
      .child(row("worktree-open", icon("branch"), "Open worktree\u2026", worktree("open", 560, 480), "", Boolean(space)))
      .when(p.own && Boolean(space), el => el
        .when(p.linked, el => el.child(row("worktree-remove", icon("branch"), "Remove worktree\u2026", worktree("remove", 440, 260))))
        .child(line())
        .child(row("close", icon("x"), "Close space", () => run("space.close", { id }))));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    return out;
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => (collapsed ? this.compact(r, t) : [this.row(r, t), ...(this.expanded(r.w) && !dense() ? this.children(r.w, t) : [])]);
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.flatMap(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const machine = this.machines.find(k => k.name === m);
      const connected = !m || machine?.state === "connected";
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).on_hover(this.hovering(`machine-${m}`)).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ? machineName(m) : "This computer"))
          .when(Boolean(m), el => { const e = this.eye(`machine-${m}`, machineKey(m), machineHidden(m), t); return e ? el.child(e) : el; })
          .when(!connected, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", m ? { machine: m } : {}); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", m ? { machine: m } : {}))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      return [head, ...(folded ? [] : mine.length ? mine.flatMap(draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  row({ w, i, g, tree }, t) {
    const on = w.active;
    const masked = spaceMasked(w);
    const name = spaceName(w);
    // Repo and branch: aliased where they can be, else the whole tail goes.
    if (g) {
      const gn = spaceText(w, g.name, null), gb = g.branch ? spaceText(w, g.branch, null) : g.branch;
      g = gn === null || gb === null ? null : { ...g, name: gn, branch: gb };
    }
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .on_hover(this.hovering(`space-${w.id}`))
      .px(8)
      .h(rowHeight({ tree }))
      .flex_none()
      .justify_center()
      .rounded(8)
      // A wash in the space's color tells spaces apart; stronger on the shown one.
      .bg(tint(spaceColor(w.id, t), on ? "38" : "10") ?? (on ? t.selected : t.chrome))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(this.pressed < i, line => line.bottom(0))
          .when(this.pressed > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = i;
        this.over = i;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces()[this.pressed];
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === i && from !== i) run("space.move", { id: spaces()[from].id, index: i + 1 });
        else if (from === i) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(t.dim)))
          .when(!tree, el => el.child(h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child(masked ? "•" : [...w.name][0]?.toUpperCase() ?? "?")))
          .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(name))
          .child(g ? this.gitTail(g, tree, name, t) : div().flex_1())
          .when(true, el => { const e = this.eye(`space-${w.id}`, spaceKey(w.id), spaceHidden(w), t); return e ? el.child(e) : el; })
          .when(true, el => { const c = this.chevron(w, t); return c ? el.child(c) : el; }),
      );
  }

  // Whether a space lists its tabs, agents and sub-agents under it.
  // `this.open[w.id]` is true or false once someone clicked its chevron, else undefined.
  expanded(w) {
    // Spaces opened or closed by hand. Read here, not in init: a saved mod reloads without init.
    this.open ??= JSON.parse(localStorage.getItem("spaces.open") ?? "{}");
    // Closed until someone opens it, except the selected space (see reveal).
    return this.open[w.id] ?? w.id === this.revealed;
  }

  // The selected tab's row is shown. The list can't be scrolled from code (only
  // virtual lists can, and their rows can't take clicks), so when another space is
  // selected it opens and every other space closes, hand-opened ones too. Selecting
  // any tab also opens its space if it was closed, and unfolds its machine.
  reveal() {
    const w = spaces().find((s) => s.active);
    const tab = w?.tabs.find((c) => c.active)?.id;
    if (!w || (w.id === this.revealed && tab === this.lastTab)) return;
    this.expanded(w);
    if (w.id !== this.revealed) this.open = {};
    else delete this.open[w.id];
    this.revealed = w.id;
    this.lastTab = tab;
    localStorage.setItem("spaces.open", JSON.stringify(this.open));
    const m = w.machine ?? null;
    if (this.folded?.has(m)) {
      this.folded.delete(m);
      localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
    }
  }

  // The fold chevron, always there: dim while closed.
  chevron(w, t) {
    if (dense()) return null;
    const open = this.expanded(w);
    return div().id(`space-fold-${w.id}`).flex_none().p(2).rounded(4).text_color(t.dim)
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.open[w.id] = !open;
        localStorage.setItem("spaces.open", JSON.stringify(this.open));
        cx.notify();
      })
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11));
  }

  // A space's tabs, each with its agents, each with its live sub-agents (depth first).
  children(w, t) {
    const color = spaceColor(w.id, t);
    const row = (o) => this.treeRow(t, { ...o, color });
    const ps = panes(), ags = agents(), all = terminals();
    const shown = new Map(ags.map((a) => [a.address, a.status]));
    const focused = ps.find((p) => p.focused)?.tab;
    const rows = [];
    const kids = (addr, depth) => all.filter((k) => k.parent === addr && k.state === "live").forEach((k) => {
      const st = shown.get(k.address) ?? k.status;
      rows.push(row({
        id: `sub-${k.address}`, depth, pic: k.program, tab: null, time: turnLabel(turn(k.address, st)),
        text: k.name || k.template || k.program?.name || k.address,
        status: st === "error" ? "blocked" : st === "done" ? "idle" : st,
        click: () => run("terminal.peek", { terminal: k.address }),
      }));
      kids(k.address, depth + 1);
    });
    // What a pane adds after its tab's name: an agent's own title, or a shell's last
    // command (the `cmd` label screenshot-mode/last-command.zsh sets). Commands can
    // hold tokens and passwords no phrase would catch, so screenshot mode never shows them.
    const detailOf = (tab, p, a) => {
      if (a) return tabText(tab.id, (a.title || "").replace(/^[^\p{L}\p{N}]+/u, "").trim(), null) || null;
      return privacyOn() ? null : all.find((k) => k.address === p.terminal)?.labels?.cmd || null;
    };
    const timeOf = (p, a) => turnLabel(a ? turn(a.address, a.status) : command(all.find((k) => k.address === p.terminal)?.labels));
    for (const tab of w.tabs ?? []) {
      const mine = ps.filter((p) => p.tab === tab.id && p.terminal);
      const lead = mine.find((p) => p.program?.agent) ?? mine.find((p) => p.focused) ?? mine[0];
      const real = tab.named ? tab.name : lead?.program?.name || `Tab ${tab.index}`;
      const name = tabText(tab.id, real, `Tab ${tab.index}`);
      const selectTab = () => { if (!w.active) run("space.select", { id: w.id }); run("tab.select", { id: tab.id }); };
      // One pane: the tab and what runs in it are one row, "tab · detail".
      if (mine.length <= 1) {
        const p = mine[0], a = p && ags.find((x) => x.pane === p.pane);
        const detail = p && detailOf(tab, p, a);
        const same = (x) => !x || [name, p?.program?.name].some((y) => y?.toLowerCase() === x.toLowerCase());
        rows.push(row({
          id: `tab-${tab.id}`, depth: 0, tab: !p?.program?.icon, pic: p?.program, on: w.active && tab.id === focused,
          text: name, detail: same(detail) ? null : detail, time: p ? timeOf(p, a) : "", mono: !a && !same(detail), status: a ? a.status : tab.status,
          click: p ? () => run("pane.focus", { pane: p.pane }) : selectTab,
        }));
        if (a) kids(a.address, 1);
        continue;
      }
      // A split: the tab, then each pane under it.
      rows.push(row({ id: `tab-${tab.id}`, depth: 0, tab: true, on: w.active && tab.id === focused, text: name, status: tab.status, click: selectTab }));
      for (const p of mine) {
        const a = ags.find((x) => x.pane === p.pane);
        rows.push(row({
          id: `pane-${p.pane}`, depth: 1, pic: p.program, on: p.focused && w.active,
          text: detailOf(tab, p, a) || p.program?.name || "Terminal", mono: !a && !privacyOn() && Boolean(detailOf(tab, p, a)),
          status: a?.status, time: timeOf(p, a), click: () => run("pane.focus", { pane: p.pane }),
        }));
        if (a) kids(a.address, 2);
      }
    }
    return rows;
  }

  // One row in a space's tree, indented by depth under the space's name.
  treeRow(t, { id, depth, pic, tab, text, detail, status, on, click, mono, time, color }) {
    const icon = !pic?.icon ? null : pic.tint ? svg(pic.icon).size(13).flex_none().text_color(t.muted) : image(pic.icon).w(13).h(13).flex_none();
    return h_flex().id(id).h(24).flex_none().pl(35 + depth * 14).pr(8).gap(7).items_center().rounded(6)
      .text_size(12).text_color(on ? t.foreground : t.muted)
      .bg(tint(color, on ? "30" : "0a") ?? (on ? t.raised : t.chrome))
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_click(click)
      .when(Boolean(tab), el => el.child(svg("mods/workspace-chrome/layers.svg").size(12).flex_none().text_color(t.dim)))
      .when(Boolean(icon), el => el.child(icon))
      .when(!detail, el => el.child(div().flex_1().min_w(0).truncate().when(Boolean(mono), el => el.font_family(settings()?.font_family ?? "JetBrains Mono").text_size(11.5)).child(text)))
      .when(Boolean(detail), el => el.child(h_flex().flex_1().min_w(0).gap(5).items_center()
        .child(div().flex_shrink(0).max_w(140).truncate().child(text))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).when(Boolean(mono), el => el.font_family(settings()?.font_family ?? "JetBrains Mono").text_size(11.5)).child(`\u00b7 ${detail}`))))
      .when(Boolean(time), el => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(time)))
      .when(status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
      .when(status === "blocked" || status === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(tone(t, status))));
  }

  compact({ w, i }, t) {
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  // null is this computer, then connected machines by name.
  targets() {
    return [null, ...this.machines.filter(m => m.state === "connected").map(m => m.name).sort()];
  }
  render() {
    if (props()?.phrases) return this.editor();
    if (props()?.newMenu) return this.newMenu();
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    const tip = privacyOn()
      ? ["Screenshot mode is ON", "Marked spaces and machines show as \"Space N\" / \"Machine N\".", "Click the eye or press Cmd+Shift+H to turn it off.", "Click the pen to edit the hide phrases."]
      : ["Screenshot mode", "1. Hover a space or machine and click its eye to mark it hidden.", "2. Click this eye or press Cmd+Shift+H to mask marked names.", "3. Click the pen to edit phrases that hide matching names automatically."];
    // Folded to its header (never on the narrow rail, which has no header).
    const shut = folded() && !collapsed;
    this.reveal();
    keepFolded("screenshot-spaces");
    return v_flex().relative().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        // The title folds the section.
        .when(!collapsed, el => el.child(h_flex().id("spaces-fold").gap(6).items_center().cursor_pointer()
          .hover(s => s.text_color(t.foreground))
          .on_click((_e, cx) => { toggleFold("screenshot-spaces"); cx.notify(); })
          .child(privacyOn() ? "Spaces · screenshot mode" : "Spaces")
          .when(shut, el => el.child(div().child(String(spaces().length))))
          .child(svg(`mods/workspace-chrome/chevron-${shut ? "right" : "down"}.svg`).size(11).flex_none())))
        .child(h_flex().gap(2).items_center()
        .child(div().id("spaces-dense").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(dense() ? t.accent : t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip(dense() ? "Roomier rows" : "Denser rows")
          .on_click((_e, cx) => { toggleDense(); cx.notify(); })
          .child(svg("mods/screenshot-spaces/list.svg").size(13)))
        .child(div().id("phrases-edit").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(phrases().length ? t.accent : t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.openEditor())
          .child(svg("mods/workspace-chrome/square-pen.svg").size(14)))
        .child(div().id("privacy-toggle").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(privacyOn() ? t.accent : t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_hover((h, cx) => { this.tip = h; cx.notify(); })
          .on_click((_e, cx) => { togglePrivacy(); cx.notify(); })
          .child(svg(`mods/screenshot-spaces/${privacyOn() ? "eye-off" : "eye"}.svg`).size(14)))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => { const w = spaces().find(s => s.active); w ? this.menu(w, false) : run("space.new"); })
          .child(svg("mods/workspace-chrome/plus.svg").size(14)))))
      .when(!shut, el => el.child(v_flex().flex_1().min_h(0).px(8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.grouped(t, collapsed))))
      .when(Boolean(this.tip), el => el.child(v_flex().absolute().top(31).left(8).right(8).p(10).gap(4).rounded(8)
        .bg(t.popover).border_1().border_color(t.border).text_size(12).text_color(t.muted)
        .child(div().font_semibold().text_color(t.foreground).child(tip[0]))
        .children(tip.slice(1).map((line, i) => div().id(`tip-${i}`).child(line)))));
  }
}
