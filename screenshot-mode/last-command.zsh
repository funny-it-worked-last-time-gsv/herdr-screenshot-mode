# Herdr: label this terminal with the command it runs and when it started and ended,
# for the Spaces tree. Add to ~/.zshrc (or source this file from it). Does nothing
# outside Herdr terminals. A command typed with a leading space clears the labels
# instead (as HIST_IGNORE_SPACE).
if [[ -n $HC_TERMINAL_ID ]] && (( $+commands[hc] )); then
  zmodload zsh/datetime
  _herdr_ran=
  _herdr_preexec() {
    local cmd=${${1%%$'\n'*}[1,200]} at=$(( EPOCHREALTIME * 1000 ))
    if [[ $1 == ' '* ]]; then cmd= at= _herdr_ran=; else _herdr_ran=1; fi
    hc label "$HC_TERMINAL_ID" "cmd=$cmd" "cmd_start=${at%.*}" "cmd_end=" &>/dev/null &!
  }
  _herdr_precmd() {
    [[ -n $_herdr_ran ]] || return
    _herdr_ran=
    local at=$(( EPOCHREALTIME * 1000 ))
    hc label "$HC_TERMINAL_ID" "cmd_end=${at%.*}" &>/dev/null &!
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec _herdr_preexec
  add-zsh-hook precmd _herdr_precmd
fi
