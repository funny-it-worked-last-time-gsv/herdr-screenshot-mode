# herdr-screenshot-mode

Hide the names of chosen spaces and machines in the [Herdr app](https://herdr.dev) so you can take screenshots or share your screen without leaking client names, repos or hostnames. It also reworks the Spaces and Agents sidebar so you can see every tab, agent and sub-agent at a glance.

![Screenshot mode](screenshot-mode/preview.png)

## Screenshot mode

Click the pen next to "Spaces" and add phrases (a client name, a hostname, a repo). Anything whose name, title, folder, repo or branch contains one is hidden. Give a phrase an alias and it is swapped in place instead: with "top secret client name" → "bob", a space called "top secret client name api" shows as "bob api". The dialog keeps the phrases smudged until you click the eye in its header.

![Hide phrases dialog](screenshot-mode/phrases.png)

Or hover a space or machine and click its eye. You can rename it (an alias), smudge it, or show it again, with every phrase listed below.

Press Cmd+Shift+H, or click the eye next to "Spaces", to turn screenshot mode on. Hidden spaces and machines without an alias show as a soft smudge everywhere: the sidebar, tab bar, agents list, pane headers and status bar. Everything inside a smudged space is smudged too (its tabs, agent titles, sub-agents, folder, repo and branch). The real text is never drawn, so there is nothing to unblur. Press Cmd+Shift+H again to get the real names back.

It can't hide what your terminals print (shell prompts, paths in output).

## The sidebar

- **Spaces list.** Each space opens into its tabs, the agents in them and their sub-agents. A tab with one pane is one row ("tab · agent title"). Selecting a tab opens its space and closes the others, so the selected tab is always on screen. A space's repo, branch and ahead/behind sit on a line under its name.
- **Menus.** The + next to "Spaces" opens Terminal, the installed agents, New space and the worktree items. Right-click a space for the same, aimed at that space, plus Rename, its color and Close.
- **Colors.** Each space's color tints its rows, its selected tab and the pane header. Pick a color from the space's right-click menu.
- **Agents list.** Agents by priority (Needs you, Done, Working, Idle, with pins on top), the tab or title on the first line and the space and machine on a smaller second line.
- **Timing.** Agents show "12 min" while working and "12 min / 3 min ago" after (how long the last turn ran, and when it ended).
- **Folding and dense rows.** Click "Spaces" or "Agents" to fold that section to its header. The list icon switches it to one-line rows.
- **Last command.** Terminals can show the last command they ran, and how long it took. Add [screenshot-mode/last-command.zsh](screenshot-mode/last-command.zsh) to your `~/.zshrc` for that. Screenshot mode never shows commands, and a command typed with a leading space isn't recorded.

See [screenshot-mode/RECIPE.md](screenshot-mode/RECIPE.md) for the details and how it is built.

## Works with Sit & Watch

It plays nicely with [Sit & Watch](https://github.com/funny-it-worked-last-time-gsv/herdr-sit-and-watch). Keep the Sit & Watch block under the Agents list, and it takes the room when you fold the Spaces or Agents section.

## Installation

Ask your agent to add this mod (it reads every file first), or by hand:

1. Copy the five folders in `screenshot-mode/mods/` into `~/.config/herdr-app/mods/`.
2. Merge `screenshot-mode/keys.json` into `~/.config/herdr-app/keys.json` (it binds `cmd-shift-h`).
3. In your own layout (clone a shipped one first with `herdr-app do layout.clone`), swap the mod names:
   `spaces` → `screenshot-spaces`, `agents` → `screenshot-agents`, `tabs` → `screenshot-tabs`,
   `workspace-status` → `screenshot-status`, and the pane header's `pane` → `screenshot-pane`.
   Skip any block your layout doesn't have.
4. So the Spaces and Agents sections can fold to their headers, set the `min` of those two blocks in your layout to `31` and `42`.
5. Optional: add `source <this repo>/screenshot-mode/last-command.zsh` to your `~/.zshrc` for each terminal's last command.

The mods are clones of Herdr 0.1.10's shipped `spaces`, `agents`, `tabs`, `workspace-status` and `pane`. They run only what those already run (`git` for the Spaces list, `hc machine ls`), make no network requests and read no files outside their folders. The zsh hook runs `hc label` on your own terminal. Delete the folders and switch your layout back to remove it.
