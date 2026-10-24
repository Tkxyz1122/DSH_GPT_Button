# dsh-quick-launcher —— DSH 快速启动组件

在 DSH 桌面客户端**左下角**放一个**圆形 GPT 图标**：**左键一键启动**（加速器 → ChatGPT 桌面客户端），
**右键菜单**提供「路径配置」「重启 <加速器名>」「重启 ChatGPT」（菜单标题「快速启动」居中、蓝色配色）。加速器路径、ChatGPT 的 AUMID、启动间隔都可在路径配置里改；
**加速器与 ChatGPT 都按最简单的方式直接打开（不做强制最小化）**，名称自动从程序文件信息读取，不写死。

## 功能

- 🟢 **圆形图标**：DeepSeek 风格渐变蓝、10% 不透明度的淡色圆圈（无模糊、完全透出后面的文字）+ ChatGPT 标志（浅色主题图标自动反色为深色，深色主题保持白色）
- ⏱ **3 秒后淡入**：打开界面后按钮先不出现，3 秒后用 0.8s 的透明+缩放动画轻轻浮现（出现前不可点、不漂浮）
- 🪄 **随机漂浮**：图标缓慢漂移（约 20–36 px/s），默认范围是**左侧栏**（界面左侧约 1/4 宽度），可在路径配置切换为**全窗口**；碰到边界会反弹并 Q 弹回弹；**拖动后 30 秒内不漂移**；可在配置里关闭
- 🚀 **左键一键启动**：按「加速器 →（可配延迟，默认 500ms）→ ChatGPT」顺序拉起，启动中图标转圈
- 🏷️ **名称自动读取**：显示名与进程名都从配置的路径推导（读 exe 文件版本信息，读不到退回文件名），换路径自动更新
- 🖱️ **右键菜单**：路径配置 / 重启 <加速器名> / 重启 ChatGPT（重启 = 杀进程 → 等待 → 重新启动）
- ⚙ **路径配置**：加速器路径（.exe / .lnk）、ChatGPT AUMID、启动间隔、随机漂浮开关、漂浮范围（左侧栏 / 全窗口），保存前校验
- 🔎 **自动检测**：扫描当前配置的加速器路径与商店版 ChatGPT（`Get-AppxPackage`）
- 🧲 可拖动（拖动只移动、不会触发启动），位置记在本机 localStorage

## 目录结构

```text
GPT_Button/               ← 仓库根目录 = 插件包
├── package.json          # DSH bundle 插件元数据（dsh.bundle.patch）
├── cordis.patch.yml      # 挂载声明
├── icon.png              # 插件列表图标
├── lib/
│   └── index.js          # 宿主半区：/dsh-launch/* 路由 + 启程逻辑
├── assets/
│   ├── launcher-widget.js# 前端半区：圆形按钮 + 右键菜单 + 路径配置
│   └── gpt-icon.png      # 圆形按钮用的 ChatGPT 图标
├── docs/
│   ├── preview.png       # 界面效果截图
│   └── install.png       # 「添加插件」界面截图
└── ...                   # scripts / test / README 等仓库辅助文件
```

## 宿主路由（全部只接受本机回环请求）

| 路由 | 方法 | 用途 |
|---|---|---|
| `/dsh-launch/state.json` | GET | 配置 + 两程序运行状态 + 上次启动记录 |
| `/dsh-launch/open` | POST `{id}` | 启动单个目标（`accelerator` / `chatgpt`） |
| `/dsh-launch/chain` | POST | 连招启动（加速器→延迟→ChatGPT） |
| `/dsh-launch/restart` | POST `{id}` | 重启单个目标：结束进程后重新启动 |
| `/dsh-launch/config` | GET / POST | 读取 / 保存配置 |
| `/dsh-launch/detect.json` | GET | 检测加速器路径与 ChatGPT AUMID |
| `/dsh-launch/gpt-icon.png` | GET | 圆形按钮图标 |
| `/dsh-launch/widget.js` | GET | 前端脚本 |

## 配置数据

保存在 `C:\Users\<用户名>\.dsh\.dsh-launch.json`（可用环境变量 `DSH_HOME` 改数据根目录）：

```json
{
  "version": 1,
  "delayMs": 500,
  "float": true,
  "floatRange": "left",
  "apps": {
    "accelerator": {
      "label": "",
      "enabled": true,
      "kind": "exe",
      "path": "D:\\_App\\FalemonVPN\\Falemon.exe",
      "processName": ""
    },
    "chatgpt": {
      "label": "ChatGPT",
      "enabled": true,
      "kind": "aumid",
      "aumid": "OpenAI.Codex_2p2nqsd0c76g0!App",
      "processName": "ChatGPT.exe"
    }
  }
}
```

> `label` 与 `processName` 留空 = 自动推导（exe 文件版本信息 / 文件名），换路径不用手改名字；
> `float: false` 可关闭随机漂浮；`floatRange` 为漂浮范围：`"left"` 左侧栏 / `"full"` 全窗口；
> `delayMs` 为加速器到 ChatGPT 的启动间隔（默认 500）。

> ChatGPT 是微软商店应用（WindowsApps 受保护目录），不能直接 spawn exe，
> 插件用 `explorer.exe shell:AppsFolder\<包族名>!App` 启动。

## 安装（桌面端）

桌面端 profile 由 Electron 客户端托管，命令行 `dsh plugin` 不认 `--profile desktop`。
请在桌面客户端的会话里让 DSH 用内置 `plugin_manager` 安装本目录：

> 请使用当前桌面端内置的 `plugin_manager` 安装本目录的 dsh-quick-launcher。

或从界面「插件管理」页从本地目录安装。安装完成后**完全退出客户端（含托盘）再重开**，
左下角应出现「快速启动」小坞。

## 验证

1. 打开 DSH 桌面客户端，左下角出现圆形 GPT 图标；
2. 右键 →「路径配置」→「检测」，应提示已检测到 ChatGPT 应用；
3. 左键点图标，加速器与 ChatGPT 都正常打开、约 1.5 秒后 ChatGPT 出现；
4. 右键菜单里两个「重启 <名字>」应显示自动读取到的程序名。

## 卸载

从插件管理里移除 `dsh-quick-launcher`；用户配置文件 `.dsh-launch.json` 可保留（重装后继续用）。

## 排错

- **左下角没有坞**：确认装到了 `desktop` profile；完全退出客户端重开；查看宿主日志有无 `[dsh-quick-launcher]` 报错。
- **点启动没反应**：看设置里路径是否存在（橙点 = 路径失效）；ChatGPT 的 AUMID 形如 `OpenAI.Codex_2p2nqsd0c76g0!App`。
- **启动失败提示文件不存在**：加速器升级后路径可能变了，去设置里改。
