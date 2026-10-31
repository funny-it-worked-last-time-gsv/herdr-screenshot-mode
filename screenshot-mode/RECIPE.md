# Screenshot mode

A switch in the Spaces sidebar that hides the names of chosen spaces and machines so the window can be screenshotted or screen-shared safely. Hover a space or a machine header and click its eye to mark it. Or add phrases to a hide list (the pen beside "Spaces"), and anything whose name, title, folder, repo or branch contains one is hidden automatically. Then turn screenshot mode on with the eye beside "Spaces" or Cmd+Shift+H. Marked spaces read "Space 2", marked machines read "Machine 1", and their tabs, agents, pane titles, folders, repos and branches are masked across the window. Unmarked spaces stay as they are.

![Screenshot mode](preview.png)

## What you see

- **Spaces header** (31px tall, 11.5px dim text, 16px left padding). It reads "Spaces", or "Spaces · screenshot mode" while the mode is on. To the left of the existing + button sit two 26×26 buttons (14px icons, 6px radius): a pen (`mods/workspace-chrome/square-pen.svg`, `accent` when the phrase list has entries, else `dim`) that opens the phrase dialog, then an eye. It shows an open eye in `theme().dim` while off, and a crossed-out eye in `theme().accent` while on.
- **Help box.** While the pointer is over the header eye, a box appears 31px from the top, 8px in from both sides. It has `popover` background, `border` 1px border, 8px radius, 10px padding and 12px `muted` text. A `foreground` semibold title sits above the instruction lines. Off: "Screenshot mode", "1. Hover a space or machine and click its eye to mark it hidden.", "2. Click this eye or press Cmd+Shift+H to mask marked names.", "3. Click the pen to edit phrases that hide matching names automatically." On: "Screenshot mode is ON", "Marked spaces and machines show as "Space N" / "Machine N".", "Click the eye or press Cmd+Shift+H to turn it off.", "Click the pen to edit the hide phrases." It draws over the list.
- **Phrase dialog.** A Herdr dialog (380 wide, sized to content) with `popover` background and 18px padding. It has a 15px semibold "Hide phrases" title with a dim "Esc" at the right, then an 11.5px `muted` explanation: "In screenshot mode, any space, machine, tab or terminal whose name, title, folder, repo or branch contains one of these (any case) is hidden." Below that is a 34px input (8px radius, `accent` border, `background` fill, placeholder "Add a phrase, press Enter"). Then comes the list, at most 220px tall and scrolling: one 28px `raised` row per phrase with a 12px × button, or a dim "No phrases yet.". A `solid` "Done" button sits at the bottom right.
- **Row eyes.** Each space row and each remote machine header shows a 12px eye at its right end on hover. The eye is open when the item is not hidden, and crossed out (`accent`) when it is hidden, whether marked by hand or matched by a phrase. While the mode is off, hidden items keep showing their crossed-out eye without hover so you can see what will be hidden. While the mode is on, the eyes only appear on hover, so a screenshot shows nothing.
- **Masked space row.** The name becomes "Space N" (N is the space's 1-based position in `spaces()`). The avatar keeps its color but shows "•" instead of the first letter. The repo, branch and ahead/behind tail is dropped.
- **Masked machine.** The header, the "New space on" chooser and the agents list show "Machine N". N is the 1-based position of that name among marked machines, sorted by name. "This computer" is never masked.
- **Tab bar.** A masked tab (its space is masked, or its name or any of its terminals' title, folder or branch matches a phrase) shows its program's name ("Claude Code", "zsh"), or "Tab N" when there is no program.
- **Agents list.** Agents in a masked space show the masked space name, and the program name instead of the tab name or title. Group headers use the masked space name. The machine tag on remote agents is masked.
- **Pane header.** In a masked space the terminal title falls back to the program name and the folder text is blank.
- **Status bar.** A masked machine shows as "Machine N". The branch is hidden when the active space is masked or the branch matches a phrase.
- **Repo and branch tail.** In the Spaces list it is also dropped when the repo or branch matches a phrase.

## How it behaves

- Agent statuses (working, blocked, done, idle) look exactly as in Herdr's shipped mods. Only text changes.
- Clicking a row's eye toggles that space or machine in the marked list. If the item is hidden only by a phrase, the click opens the phrase dialog instead, since a phrase match can't be unmarked from the row. An eye click never selects the space or folds the machine.
- Marking a machine, or a phrase matching its name, masks every space on it.
- A space is hidden when it is marked, its machine is hidden, or its name or folder matches a phrase. A tab is hidden when its space is, or its name or any terminal in it (title, folder, branch) matches. Only that tab is masked then, not its space.
- In the phrase dialog, Enter adds the trimmed phrase (duplicates and blanks are dropped), × removes one, and Esc or Done closes it. Changes apply at once everywhere.
- Clicking the header eye, or the key `cmd-shift-h` (action `screenshot-spaces.privacy`), toggles the mode. Every mod re-renders at once because the state is shared.
- The marked list and the on/off flag persist across restarts (shared state).
- Hovering the header eye shows the help box. Moving off hides it.

## Built from

Five clones of Herdr 0.1.10's shipped mods, each with the same `privacy.js` helper copied into its folder:

| Mod | Cloned from | Replaces in the layout |
| --- | --- | --- |
| `screenshot-spaces` | `spaces` | the Spaces sidebar block |
| `screenshot-agents` | `agents` | the Agents sidebar block |
| `screenshot-tabs` | `tabs` | the tab bar block |
| `screenshot-status` | `workspace-status` | the status bar block |
| `screenshot-pane` | `pane` | the pane `header.content.mod` |

- **State.** It lives in `shared("privacy")` as `{ on: boolean, hidden: string[], phrases: string[] }`, with keys `space:<space id>` and `machine:<name>`. Remote space ids keep their `machine/` prefix. `setShared("privacy", …)` writes it.
- **`privacy.js` exports.** `privacyOn`, `isMarked(key)`, `toggleMarked(key)`, `togglePrivacy()`, `spaceKey(id)`, `machineKey(name)`, `spaceMasked(spaceOrId)`, `machineMasked(name)`, `spaceName(space)`, `machineName(name)`, `spaceOfTab(tabId)`, `tabMasked(tabId)`, `phrases()`, `setPhrases(list)`, `matches(...texts)` (case-insensitive substring), and `machineHidden`, `spaceHidden` and `tabHidden` (the same tests ignoring whether the mode is on, for the sidebar's eyes). It reads `spaces()`, `panes()`, `shared` and `setShared` from `herdr`. Masked machines are numbered among every hidden machine name (marked, or phrase-matched on a space's machine), sorted.
- **screenshot-spaces.** It adds `nextCommand` in `init` (a loop that toggles on `"privacy"`), a `hoverRow` id set by `on_hover` on rows and machine headers, an `eye(id, key, hidden, t)` helper and `this.tip` for the help box. The same mod is the phrase dialog: `openOverlay({ mod: "screenshot-spaces", kind: "dialog", width: 380, height: 420, props: { phrases: true } })`. With `props().phrases`, `init` sets up an `InputState` (submit adds a phrase) and skips the sidebar's git and machine timers, and `render` returns the dialog. The help box is the root `v_flex().relative()`'s last child, positioned `absolute()`. Icons are `mods/screenshot-spaces/eye.svg` and `eye-off.svg` (24×24, stroke `currentColor`, width 2, drawn with `svg()`). This build also keeps a "New space on" chooser under the header's + button when remote machines are connected. Its machine names are masked too.
- **screenshot-agents.** A `sn(a)` helper gives the space name through `spaceName`. Every `a.space_name` uses it. `label(a)` returns `a.program?.name` for a masked tab. The machine tag goes through `machineName`.
- **screenshot-tabs.** The pill name is `tabMasked(c.id) ? program?.name ?? \`Tab ${i + 1}\` : <shipped rule>`.
- **screenshot-pane.** `masked = tabMasked(p.tab)`. The title skips `p.title` when masked and the folder renders "".
- **screenshot-status.** `machineName(space.machine)`, and the branch label only when `!spaceMasked(space) && !(privacyOn() && matches(space.branch))`.
- **Programs and files.** The mods run only what the shipped mods already run: `git` (branch and status for the Spaces list, via `exec`) and `hc machine ls --json`. They make no network requests and read no files outside their folders.

## Watch out

- A mod cannot import another mod's files (`../other-mod/x.js` fails `herdr-app check` with "resolves outside the application directory"). So `privacy.js` is copied into every folder. Keep the copies identical.
- `View.tooltip(text)` on the header eye never appeared in the sidebar block on 0.1.10. That is why the help box is drawn by the mod on hover.
- An absolute overlay must be the root's last child, or the list paints over it.
- `mod.clone` rewrites `mods/<name>/…` asset paths. When renaming a clone, rewrite them too: `mods/screenshot-tabs/win-*.svg`, `mods/screenshot-pane/*.svg`, `mods/screenshot-spaces/eye*.svg`, and the agents sort popup's `openOverlay({ mod: "screenshot-agents" })`.
- A dialog sizes to its content, so a `flex_1().min_h(0)` list inside it collapses to nothing. Give the phrase list `flex_none().max_h(220)`.
- Saving a mod reloads it in place without re-running `init`. A flag set there won't show until the next start.
- It cannot mask what a terminal prints (shell prompts with user and host, paths in output), the Cmd+P picker, the Files and Changes panels, menus or other mods. Sub-agent rows in the agents list keep their own names.
- The key is `cmd-` (macOS). On Linux or Windows bind `ctrl-shift-h` or similar instead. The help text says Cmd+Shift+H either way.
- These are clones of Herdr 0.1.10's mods. On a later Herdr, a fresh build from this recipe on top of new clones is safer than copying the files.
- To use it, point your own (cloned) layout's blocks at the five mods. The installer has to do this, since the mod ships no layout.

## Done when

1. `herdr-app check ~/.config/herdr-app/mods/<each of the five>` passes.
2. The layout's spaces, agents, tab bar, status bar and pane header blocks name the `screenshot-*` mods, and `herdr-app status` shows `"errors": []`.
3. Hovering the eye beside "Spaces" shows the help box. Moving away hides it.
4. Clicking a space's eye with the mode off leaves a crossed-out eye on that row, and `shared("privacy").hidden` contains `space:<id>`.
5. Cmd+Shift+H changes the header to "Spaces · screenshot mode". The marked space reads "Space N" with a "•" avatar and no git tail. Its tabs show program names, its agents show "Space N", its pane header has no folder, and the status bar has no branch.
6. Marking a remote machine and turning the mode on shows "Machine 1" in the sidebar header, the chooser, the agents list and the status bar, and masks every space on it.
7. Clicking the pen opens "Hide phrases". Adding a phrase found in a space's name (mode on) turns that row into "Space N" without any eye click, and with the mode off its row shows a crossed-out eye. Clicking that eye opens the dialog. Removing the phrase brings the name back.
8. A phrase found only in one tab's terminal title or folder masks that tab's pill, pane header and agent rows, but not the space name.
9. Cmd+Shift+H again restores every real name. Marks survive a restart.
