#!/bin/zsh
# uu-term-bridge 卸载器。把安装器放进去的东西全部拿掉，~/.zshrc 回到原样。
set -u
ROOT="${0:A:h}"
source "$ROOT/lib/common.sh"

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { print "用法: ./uninstall.sh"; exit 0 }

backup_file "$ZSHRC"
[[ -z "${BRIDGE_NO_LAUNCHD:-}" ]] && launchd_unload
rm -f "$PLIST" "$PROFILE_FILE" "$BIN_DIR/uu-attach" "$BIN_DIR/uu-term-watch" "$BIN_DIR/uu-new"
block_remove "$ZSHRC"
rm -rf "$SHARE_DIR" "$STATE_DIR/claimed" "$STATE_DIR/pending" "$STATE_DIR"/*.log(N)
ok "已卸载。UU 终端 profile 已移除，iTerm2 的默认 profile 会自动回到 Default"
print "rc 文件的备份在 $BACKUP_DIR，确认没问题可以删掉整个目录。"
