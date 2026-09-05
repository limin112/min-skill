#!/bin/zsh
# uu-term-bridge 共用函数。被 install.sh / uninstall.sh source。
# 所有路径都从 $HOME 推导，把 HOME 指到临时目录就能沙盒安装（test/smoke.sh 就是这么做的）。

BIN_DIR="${HOME}/.local/bin"
SHARE_DIR="${HOME}/.local/share/uu-term-bridge"
STATE_DIR="${HOME}/.local/state/uu-term-bridge"
BACKUP_DIR="${STATE_DIR}/backup"
ZSHRC="${ZSHRC:-${HOME}/.zshrc}"
ITERM_PROFILES="${HOME}/Library/Application Support/iTerm2/DynamicProfiles"
PROFILE_FILE="${ITERM_PROFILES}/uu-term-bridge.json"
LAUNCH_AGENTS="${HOME}/Library/LaunchAgents"
PLIST="${LAUNCH_AGENTS}/com.uu-term-bridge.watch.plist"
LAUNCH_LABEL="com.uu-term-bridge.watch"
ITERM_APP="${ITERM_APP:-/Applications/iTerm.app}"
UUYC_CLI="${UUYC_CLI:-/Applications/UURemote.app/Contents/Helpers/uuyc-cli}"
UUYC_MUX="${UUYC_MUX:-/Applications/UURemote.app/Contents/Helpers/tmux/uuyc-mux}"
UUYC_SOCK="${UUYC_SOCK:-${HOME}/Library/Application Support/UURemote/tmux.sock}"

log()  { print -r -- "    $*" }
ok()   { print -r -- "  ✓ $*" }
warn() { print -r -- "  ! $*" }
fail() { print -ru2 -- "  ✗ $*"; return 1 }

# 改 rc 文件前备份一份，带时间戳
backup_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  mkdir -p "$BACKUP_DIR"
  cp -p "$f" "${BACKUP_DIR}/${f:t}.$(date +%Y%m%d-%H%M%S)"
}

# ---- 受管块 ----
# 往 rc 文件里写一段带标记的片段。重复安装先删旧块再写，幂等；卸载整段删掉，
# 连同块前面那个空行一起删，文件回到原样。
BLOCK_BEGIN="# >>> uu-term-bridge >>>"
BLOCK_END="# <<< uu-term-bridge <<<"

block_present() { [[ -f "$1" ]] && grep -qF -- "$BLOCK_BEGIN" "$1" }

block_remove() {
  local file="$1" tmp
  block_present "$file" || return 0
  tmp="$(mktemp)"
  awk -v b="$BLOCK_BEGIN" -v e="$BLOCK_END" '
    $0 == b { if (held_set && held == "") held_set = 0; skip = 1; next }
    $0 == e { skip = 0; next }
    skip    { next }
    { if (held_set) print held; held = $0; held_set = 1 }
    END { if (held_set) print held }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

block_write() {
  local file="$1" content="$2"
  block_remove "$file"
  [[ -f "$file" ]] || : > "$file"
  if [[ -s "$file" && -n "$(tail -c1 "$file")" ]]; then print >> "$file"; fi
  {
    print
    print -r -- "$BLOCK_BEGIN"
    print -r -- "$content"
    print -r -- "$BLOCK_END"
  } >> "$file"
}

launchd_load() {
  launchctl bootout "gui/$(id -u)/$LAUNCH_LABEL" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
}
launchd_unload() { launchctl bootout "gui/$(id -u)/$LAUNCH_LABEL" >/dev/null 2>&1 || true }
launchd_running() { launchctl print "gui/$(id -u)/$LAUNCH_LABEL" >/dev/null 2>&1 }
