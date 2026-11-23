#!/bin/bash
# Mac 上双击运行：启动换脸服务并用 Chrome 打开网页。服务在后台跑，关掉这个窗口不影响。
cd "$(dirname "$0")" && ./start.sh
echo
read -r -p "按回车关闭这个窗口（服务会继续在后台运行，停止用 ./start.sh stop）"
