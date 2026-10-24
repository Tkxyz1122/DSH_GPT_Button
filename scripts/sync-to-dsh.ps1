<#
.SYNOPSIS
把本仓库里的 dsh-quick-launcher 同步到已安装的插件目录（本地开发用）。

.DESCRIPTION
桌面端插件由 DSH 客户端托管；本脚本只做文件同步，不修改 profile 清单。
默认目标为 profile 的 node_modules 目录（若使用 link: 安装，写入会落到源目录）。

.EXAMPLE
powershell -File scripts/sync-to-dsh.ps1
powershell -File scripts/sync-to-dsh.ps1 -Destination "D:\_App\DeepSeek Harness\plugins\dsh-quick-launcher"
#>
param(
  [string]$Destination = $(if ($env:DSH_PLUGIN_DIR) { $env:DSH_PLUGIN_DIR } else { Join-Path $env:USERPROFILE '.dsh\profiles\desktop\node_modules\dsh-quick-launcher' })
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'dsh-quick-launcher'

if (-not (Test-Path (Join-Path $src 'package.json'))) {
  throw "找不到插件源码：$src"
}
if (-not (Test-Path $Destination)) {
  throw "目标目录不存在：$Destination（请先按 README 安装插件，或用 -Destination 指定）"
}

robocopy $src $Destination /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy 失败，退出码 $LASTEXITCODE"
}
Write-Output ("已同步 -> " + $Destination)
Write-Output "改前端刷新页面即可；改宿主需要重启 DSH 客户端。"
