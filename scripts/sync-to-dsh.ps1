<#
.SYNOPSIS
把本仓库（插件本体在根目录）同步到已安装的插件目录（本地开发用）。

.DESCRIPTION
桌面端插件由 DSH 客户端托管；本脚本只做文件同步，不修改 profile 清单。
同步时排除 .git / docs / scripts / test，只复制插件运行需要的文件。
默认目标为 profile 的 node_modules 目录（若使用 link: 安装，写入会落到源目录）。

.EXAMPLE
powershell -File scripts/sync-to-dsh.ps1
powershell -File scripts/sync-to-dsh.ps1 -Destination "D:\_App\DeepSeek Harness\plugins\dsh-gpt-button"
#>
param(
  [string]$Destination = $(if ($env:DSH_PLUGIN_DIR) { $env:DSH_PLUGIN_DIR } else { Join-Path $env:USERPROFILE '.dsh\profiles\desktop\node_modules\dsh-gpt-button' })
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $root 'package.json'))) {
  throw "找不到插件源码：$root"
}
if (-not (Test-Path $Destination)) {
  throw "目标目录不存在：$Destination（请先按 README 安装插件，或用 -Destination 指定）"
}

robocopy $root $Destination /E /NFL /NDL /NJH /NJS /NP `
  /XD (Join-Path $root '.git') (Join-Path $root 'docs') (Join-Path $root 'scripts') (Join-Path $root 'test') | Out-Null

if ($LASTEXITCODE -ge 8) {
  throw "robocopy 失败，退出码 $LASTEXITCODE"
}
Write-Output ("已同步 -> " + $Destination)
Write-Output "改前端刷新页面即可；改宿主需要重启 DSH 客户端。"
