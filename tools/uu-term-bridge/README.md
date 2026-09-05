# uu-term-bridge

让网易UU远程手机端的终端列表看到并接管你 Mac 上 iTerm2 里的每一个标签；反过来，手机上新开的终端在 Mac 上自动弹出窗口。

## 背景

网易UU远程自带终端功能：手机上打开就是一个真正的终端，不用盯着远程桌面的画面去找窗口。但它只认自己开的会话，本地 iTerm2 里开的标签，手机端列表里看不到。

UU 的终端底层是它自带的一个 tmux（socket 在 `~/Library/Application Support/UURemote/tmux.sock`），会话由 UU 主程序登记，登记只发生在通过它的命令行工具 `uuyc-cli lterm new` 建会话的时候。

所以做法是：让 iTerm2 的每个标签一出来就是经 `uuyc-cli` 建的 UU 会话。这个仓库把这件事自动化，外加反方向的联动。

## 它做了什么

本地到手机：装一个 iTerm2 profile 叫 UU 终端 (uu-term-bridge)，启动命令是建 UU 会话。把它设成默认 profile 后，每个 Cmd+T、Cmd+N、Cmd+D 开出来的标签、窗口、分屏，手机列表里立刻有。关掉标签，会话跟着结束，和普通终端一样。

手机到本地：一个 launchd 常驻的 watcher 每 2 秒看一次 UU 的 tmux socket，手机端新建了终端，Mac 上自动弹一个 iTerm2 窗口 attach 上去，两边画面同步。

| 文件 | 干什么 |
|---|---|
| `bin/uu-new` | profile 的启动命令。建 UU 会话；关窗口时结束会话；UU 没在跑就退回普通 shell |
| `bin/uu-term-watch` | 常驻 watcher。手机开的新会话弹窗接管；本地建的不弹 |
| `bin/uu-attach` | 弹出来的窗口里跑的东西，负责 attach |
| `uut.zsh` | shell 函数 `uut [名字]`，在任意已有标签里手动进一个 UU 会话；别名 `uucli` 指向 uuyc-cli |

## 安装

前提：macOS，已安装并登录网易UU远程，已安装 iTerm2。

```bash
git clone https://github.com/limin112/min-skill.git
cd min-skill/tools/uu-term-bridge
./install.sh --dry-run   # 先看会做什么
./install.sh
```

然后两步：

1. 新开一个终端，或者 `source ~/.zshrc`
2. iTerm2 Settings > Profiles > 左边选 UU 终端 (uu-term-bridge) > 下方 Other Actions… > Set as Default

第一次自动弹窗时 macOS 会问一次是否允许控制 iTerm2，点允许。

```bash
./install.sh --status    # 装了没、watcher 在不在跑
./uninstall.sh           # 全部拿掉，~/.zshrc 回到原样
```

安装器做的事：往 `~/.local/bin/` 放三个脚本，往 `~/.local/share/uu-term-bridge/` 放 uut.zsh，往 iTerm2 的 DynamicProfiles 放一个 json，注册一个 launchd 用户代理，往 `~/.zshrc` 追加一段带标记的受管块。改 `~/.zshrc` 前会备份到 `~/.local/state/uu-term-bridge/backup/`。卸载把受管块整段删掉，文件回到原样。

受管块长这样，手动改动请放在块外面，重装会整段覆盖：

```
# >>> uu-term-bridge >>>
source "/Users/you/.local/share/uu-term-bridge/uut.zsh"
# <<< uu-term-bridge <<<
```

## 日常

本地：设成默认 profile 后什么都不用做。不想设默认，就在 Profiles 菜单里选 UU 终端 开标签，或者在任意已有标签里敲 `uut`。

手机：UU 远程连 Mac，进终端，列表里就是你 Mac 上所有的标签，点一个进一个。你在手机上新建的终端，Mac 上会自动弹出一个窗口。

关闭：Mac 上关掉标签，会话结束，手机列表里消失。想反过来，关窗口只断开、会话留着给手机接管，把 profile 的 Command 改成 `env UU_TERM_KEEP=1 /Users/you/.local/bin/uu-new`。

## 可调参数

在 `~/Library/LaunchAgents/com.uu-term-bridge.watch.plist` 的 EnvironmentVariables 里改，改完 `./install.sh` 重装一次生效：

- `UU_TERM_PROFILE`：watcher 弹窗用哪个 iTerm2 profile。比如你有一个手机比例的 profile，填它的名字。
- `UU_WATCH_INTERVAL`：轮询间隔秒，默认 2。

日志在 `~/.local/state/uu-term-bridge/watch.log`。

## UU 的相关行为

实测得到，UU 改版后可能变：

- tmux 会话名是 `uuremote-<数字>`，显示名存在 window name 上。
- 显示名不保证唯一，`lterm ls` 会把同名的合并成一条。watcher 因此直接看 socket 上的 tmux 会话名。
- `lterm new 名字` 给的名字 UU 不一定采用，有时会改成 session{N}。
- `lterm new` 和 `lterm attach` 需要一个真正的 tty。
- 最后一个会话结束后，UU 会自动补一个没人挂着的空会话。watcher 对没有客户端的新会话不弹窗，等手机真的打开它再弹。
- UU 那层 tmux 的前缀键是 C-]，状态栏关着，鼠标开着。

## 验证过的环境

macOS 26（Darwin 25.2），iTerm2 3.6.11，网易UU远程内置 uuyc-cli 与 tmux 3.5a。

`./test/smoke.sh` 做语法检查，然后在临时 HOME 里装、重装、卸载并字节级比对 `~/.zshrc`。不碰真实配置，不启动 launchd，不需要真的装 UU。

## 文件清单

| 装到哪 | 内容 |
|---|---|
| `~/.local/bin/` | uu-attach、uu-term-watch、uu-new |
| `~/.local/share/uu-term-bridge/` | uut.zsh |
| `~/Library/Application Support/iTerm2/DynamicProfiles/uu-term-bridge.json` | UU 终端 profile |
| `~/Library/LaunchAgents/com.uu-term-bridge.watch.plist` | watcher 的 launchd 代理 |
| `~/.zshrc` | 受管块一段 |
| `~/.local/state/uu-term-bridge/` | 认领记录、pending、日志、rc 备份 |

## 许可证

MIT
