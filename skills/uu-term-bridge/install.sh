#!/bin/zsh
# uu-term-bridge 安装器
#   ./install.sh             安装（重复执行是幂等的，也用来升级）
#   ./install.sh --dry-run   只打印会做什么
#   ./install.sh --status    看装了没有、watcher 在不在跑
set -u
ROOT="${0:A:h}"
source "$ROOT/lib/common.sh"

usage() { print "用法: ./install.sh [--dry-run] [--status]" }

DRY_RUN=0
STATUS=0
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=1 ;;
    --status)  STATUS=1 ;;
    *) fail "未知参数: $arg"; usage; exit 1 ;;
  esac
done

status() {
  if block_present "$ZSHRC"; then
    ok "已安装"
    if launchd_running; then log "watcher 在跑"; else warn "watcher 没在跑，重新执行 ./install.sh 即可"; fi
    [[ -f "$PROFILE_FILE" ]] && log "iTerm2 profile 在: UU 终端 (uu-term-bridge)" || warn "iTerm2 profile 文件不在"
  else
    log "未安装"
  fi
}

check_prereqs() {
  local okc=0
  [[ -x "$UUYC_CLI" ]] && ok "uuyc-cli: $UUYC_CLI" || { fail "找不到 $UUYC_CLI，需要先装网易UU远程"; okc=1 }
  [[ -x "$UUYC_MUX" ]] && ok "UU 自带 tmux: $UUYC_MUX" || { fail "找不到 $UUYC_MUX，UU 自带的 tmux 不在预期位置"; okc=1 }
  [[ -d "$ITERM_APP" ]] && ok "iTerm2: $ITERM_APP" || { fail "找不到 $ITERM_APP，弹窗靠 iTerm2 的 AppleScript"; okc=1 }
  return $okc
}

plan() {
  log "复制 uu-attach、uu-term-watch、uu-new 到 $BIN_DIR/"
  log "复制 uut.zsh 到 $SHARE_DIR/"
  log "写入 iTerm2 动态配置 $PROFILE_FILE（UU 终端 profile）"
  log "写入 $PLIST 并加载（登录自启）"
  log "写入 $ZSHRC 受管块（uucli 别名、uut 函数）"
  log "状态目录 $STATE_DIR/"
}

do_install() {
  mkdir -p "$BIN_DIR" "$SHARE_DIR" "$STATE_DIR" "$LAUNCH_AGENTS" "$ITERM_PROFILES"
  install -m 755 "$ROOT/bin/uu-attach"     "$BIN_DIR/uu-attach"
  install -m 755 "$ROOT/bin/uu-term-watch" "$BIN_DIR/uu-term-watch"
  install -m 755 "$ROOT/bin/uu-new"        "$BIN_DIR/uu-new"
  cp "$ROOT/uut.zsh" "$SHARE_DIR/uut.zsh"
  sed "s#__HOME__#$HOME#g" "$ROOT/profile.json" > "$PROFILE_FILE"

  local path_for_agent="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  sed -e "s#__HOME__#$HOME#g" \
      -e "s#__UUYC_CLI__#$UUYC_CLI#g" \
      -e "s#__UUYC_MUX__#$UUYC_MUX#g" \
      -e "s#__UUYC_SOCK__#$UUYC_SOCK#g" \
      -e "s#__PATH__#$path_for_agent#g" \
      "$ROOT/watch.plist.tmpl" > "$PLIST"

  block_write "$ZSHRC" "source \"$SHARE_DIR/uut.zsh\""

  if [[ -z "${BRIDGE_NO_LAUNCHD:-}" ]]; then
    launchd_load
    ok "watcher 已启动（launchd: $LAUNCH_LABEL）"
  else
    log "BRIDGE_NO_LAUNCHD 已设置，跳过 launchctl"
  fi
  ok "装好了"
}

if (( STATUS )); then status; exit 0; fi

print "== 前置检查 =="
check_prereqs || exit 1

if (( DRY_RUN )); then
  print; print "== 计划 =="; plan
  print; print "以上是 dry-run，什么都没改。"
  exit 0
fi

print; print "== 安装 =="
backup_file "$ZSHRC"
do_install

print
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR 不在 PATH 里，往 ~/.zshrc 加一行: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac
print "接下来："
print "  1. 新开一个终端，或者执行 source ~/.zshrc"
print "  2. 让每个新标签都自动进手机列表：iTerm2 Settings > Profiles > 选 UU 终端 (uu-term-bridge) > Other Actions… > Set as Default"
print "  3. 第一次自动弹窗时 macOS 会问一次是否允许控制 iTerm2，点允许"
print "rc 文件的备份在 $BACKUP_DIR"
