# Herdr: label this terminal with the command it is running, for the Spaces tree.
# Add to ~/.zshrc (or source this file from it). Does nothing outside Herdr terminals.
if [[ -n $HC_TERMINAL_ID ]] && (( $+commands[hc] )); then
  _herdr_last_command() { hc label "$HC_TERMINAL_ID" "cmd=${${1%%$'\n'*}[1,200]}" &>/dev/null &! }
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec _herdr_last_command
fi
