# uu-term-bridge
#
#   uucli          网易UU远程 CLI（uuyc-cli）的别名，uucli --help 看全部子命令
#   uut [名字]     在当前窗口开一个 UU 终端会话，手机端终端列表里能看到并接管。
#                  名字已存在就直接接管，不存在就新建。名字默认取当前目录名。
#                  建会话必须走 uuyc-cli，UU 才会登记；直接对它的 tmux 建会话它不认。

alias uucli="${UUYC_CLI:-/Applications/UURemote.app/Contents/Helpers/uuyc-cli}"

uut() {
  local cli="${UUYC_CLI:-/Applications/UURemote.app/Contents/Helpers/uuyc-cli}"
  local state="${UU_BRIDGE_STATE:-$HOME/.local/state/uu-term-bridge}"
  if [[ -n "${UUYC_IN_MUX:-}" ]]; then
    print -u2 "当前已经在 UU 会话里了，不用再套一层"
    return 1
  fi
  local name="${1:-${PWD:t}}"
  if "$cli" lterm has "$name" >/dev/null 2>&1; then
    "$cli" lterm attach "$name"
  else
    # 先留个 pending 标记，watcher 看到接下来 15 秒内出现的新会话就不弹窗
    mkdir -p "$state"
    date +%s >> "$state/pending"
    "$cli" lterm new "$name"
  fi
}
