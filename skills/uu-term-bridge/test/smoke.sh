#!/bin/zsh
# 冒烟测试：语法检查，然后在临时 HOME 里装、重装、卸载，最后字节级比对 ~/.zshrc。
# 不碰真实 HOME，不启动 launchd，不弹窗，不需要真的装 UU。
set -u
ROOT="${0:A:h:h}"
pass=0
failn=0

check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    print "  ✓ $desc"; (( pass++ ))
  else
    print "  ✗ $desc"; (( failn++ ))
  fi
}
plist_ok() {
  sed -e 's#__HOME__#/tmp/x#g' -e 's#__UUYC_CLI__#/tmp/cli#g' -e 's#__UUYC_MUX__#/tmp/mux#g' \
      -e 's#__UUYC_SOCK__#/tmp/sock#g' -e 's#__PATH__#/usr/bin#g' \
      "$ROOT/watch.plist.tmpl" | plutil -lint -s -
}
json_ok() { jq empty "$1" 2>/dev/null || python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$1" }
count_is() { [[ "$(grep -c "$1" "$2")" -eq "$3" ]] }
rc_sources() { zsh -c "source '$1' && type uut uucli" }
no_placeholder() { ! grep -q '__' "$1" }
absent() { local f; for f in "$@"; do [[ -e "$f" ]] && return 1; done; return 0 }
has_backup() { ls -A "$1" | grep -q zshrc }

print "== 语法 =="
for f in install.sh uninstall.sh lib/common.sh bin/uu-attach bin/uu-term-watch bin/uu-new uut.zsh; do
  check "zsh -n $f" zsh -n "$ROOT/$f"
done
check "profile.json 是合法 JSON" json_ok "$ROOT/profile.json"
check "watch.plist.tmpl 是合法 plist" plist_ok

print
print "== 沙盒安装 =="
SANDBOX="$(mktemp -d)"
export HOME="$SANDBOX"
export BRIDGE_NO_LAUNCHD=1
PROFILE="$HOME/Library/Application Support/iTerm2/DynamicProfiles/uu-term-bridge.json"
PLIST="$HOME/Library/LaunchAgents/com.uu-term-bridge.watch.plist"
mkdir -p "${PROFILE:h}" "${PLIST:h}"
print -r -- '# 原有 zshrc
export FOO=1' > "$HOME/.zshrc"
cp "$HOME/.zshrc" "$SANDBOX/zshrc.orig"
# 假的 uuyc-cli / uuyc-mux / iTerm2，让前置检查能过
fake="$SANDBOX/fake-uu-bin"
print -r -- '#!/bin/sh
exit 0' > "$fake"
chmod +x "$fake"
export UUYC_CLI="$fake"
export UUYC_MUX="$fake"
export ITERM_APP="$SANDBOX/iTerm.app"
mkdir -p "$ITERM_APP"

"$ROOT/install.sh" > "$SANDBOX/install.log" 2>&1
check "install 退出码 0" test $? -eq 0
check "uu-attach 已放好"       test -x "$HOME/.local/bin/uu-attach"
check "uu-term-watch 已放好"   test -x "$HOME/.local/bin/uu-term-watch"
check "uu-new 已放好"          test -x "$HOME/.local/bin/uu-new"
check "uut.zsh 已放好"         test -f "$HOME/.local/share/uu-term-bridge/uut.zsh"
check "iTerm2 profile 已写且合法" json_ok "$PROFILE"
check "profile 占位符已替换"   no_placeholder "$PROFILE"
check "plist 已写且合法"       plutil -lint -s "$PLIST"
check "plist 占位符已替换"     no_placeholder "$PLIST"
check ".zshrc 有受管块"        grep -q 'uu-term-bridge >>>' "$HOME/.zshrc"
check ".zshrc 能被 zsh 加载，uut / uucli 都在" rc_sources "$HOME/.zshrc"
check "rc 备份已生成"          has_backup "$HOME/.local/state/uu-term-bridge/backup"

print
print "== 重复安装幂等 =="
"$ROOT/install.sh" > "$SANDBOX/install2.log" 2>&1
check ".zshrc 里受管块只有一个" count_is 'uu-term-bridge >>>' "$HOME/.zshrc" 1

print
print "== 卸载 =="
"$ROOT/uninstall.sh" > "$SANDBOX/uninstall.log" 2>&1
check ".zshrc 字节级复原"  cmp -s "$HOME/.zshrc" "$SANDBOX/zshrc.orig"
check "bin 已清"           absent "$HOME/.local/bin/uu-attach" "$HOME/.local/bin/uu-term-watch" "$HOME/.local/bin/uu-new"
check "profile 已清"       absent "$PROFILE"
check "plist 已清"         absent "$PLIST"
check "share 目录已清"     absent "$HOME/.local/share/uu-term-bridge"

if (( failn > 0 )); then
  print
  print "日志留在 $SANDBOX 供排查"
else
  rm -rf "$SANDBOX"
fi
print
print "通过 $pass，失败 $failn"
(( failn == 0 ))
