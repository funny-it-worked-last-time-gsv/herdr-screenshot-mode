# Herdr: label this terminal with the command it is running, for the Spaces tree.
# Add to ~/.zshrc (or source this file from it). Does nothing outside Herdr terminals.
if [[ -n $HC_TERMINAL_ID ]] && (( $+commands[hc] )); then
  # A command typed with a leading space clears the label instead (as HIST_IGNORE_SPACE).
  _herdr_last_command() {
    local cmd=${${1%%$'\n'*}[1,200]}
    [[ $1 == ' '* ]] && cmd=
    hc label "$HC_TERMINAL_ID" "cmd=$cmd" &>/dev/null &!
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec _herdr_last_command
fi
