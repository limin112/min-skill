---
name: uu-term-bridge
description: 让网易UU远程手机端的终端列表看到并接管 Mac 上 iTerm2 的每一个标签，手机上新开的终端在 Mac 自动弹窗。当用户要"手机上看到我 Mac 的终端""UU 远程终端列表里没有我的 iTerm""用 uuyc-cli 联动 iTerm2""装/卸/排查 uu-term-bridge""关标签会话不消失""watcher 没弹窗"时使用。只适用于 macOS + iTerm2 + 网易UU远程。
version: 0.1.0
---

# uu-term-bridge

网易UU远程的终端功能只认它自己经 `uuyc-cli lterm new` 建的会话。这个 skill 把 iTerm2 的每个标签变成这样的会话，并让手机端新开的终端在 Mac 上自动弹窗。代码和安装器都在本目录，细节见 README.md。

## 什么时候用

- 用户想在手机 UU 远程的终端列表里看到并接管 Mac 上的 iTerm2 标签
- 用户装了 uu-term-bridge，某个环节不对：手机看不到、关标签会话不消失、分屏没出会话、watcher 没弹窗
- 用户要卸载或升级

## 安装

```bash
cd <本目录>
./install.sh --dry-run   # 先看会做什么
./install.sh
```

装完必须让用户做两件事，否则新标签不会进列表：

1. 新开一个终端，或者 `source ~/.zshrc`
2. iTerm2 Settings > Profiles > 选 UU 终端 (uu-term-bridge) > Other Actions… > Set as Default

第一次自动弹窗时 macOS 会问一次是否允许控制 iTerm2，点允许。

`./install.sh --status` 看装了没、watcher 在不在跑。`./uninstall.sh` 全部拿掉，`~/.zshrc` 回到原样。重复执行 `./install.sh` 是幂等的，也用来升级。

## 排查

按这个顺序看：

1. `./install.sh --status`。watcher 没在跑就重新 `./install.sh`。
2. `tail ~/.local/state/uu-term-bridge/watch.log`。每次开窗、跳过、撤销都有一行。
3. 手机列表里没有新标签：确认默认 profile 是 UU 终端；在那个标签里看 `echo $UUYC_IN_MUX`，是 1 才说明跑在 UU 会话里。
4. 手机开终端 Mac 没弹窗：日志里若有"开窗失败"，去 系统设置 > 隐私与安全性 > 自动化 给 iTerm2 授权。
5. `uucli lterm ls` 看 UU 自己的列表，`/Applications/UURemote.app/Contents/Helpers/tmux/uuyc-mux -S ~/Library/Application\ Support/UURemote/tmux.sock list-windows -a` 看它底下真正的 tmux 会话。两者不一致是 UU 的显示名合并造成的，以 tmux 为准。

## 改行为

- 关标签只断开、会话留给手机接管：profile 的 Command 改成 `env UU_TERM_KEEP=1 ~/.local/bin/uu-new`
- watcher 弹窗用指定 profile、改轮询间隔：在 `~/Library/LaunchAgents/com.uu-term-bridge.watch.plist` 的 EnvironmentVariables 里改 `UU_TERM_PROFILE`、`UU_WATCH_INTERVAL`，改完 `./install.sh` 重装一次

## 改代码之后

`./test/smoke.sh` 在临时 HOME 里装、重装、卸载并字节级比对 rc 文件，不需要真的装 UU，改完必跑。

## 边界

只做 macOS + iTerm2 + 网易UU远程这一种组合。它依赖 UU 未公开的 `uuyc-cli` 和它自带的 tmux，UU 改版可能失效，README 里列了实测到的 UU 行为。
