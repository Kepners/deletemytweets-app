param([switch]$SkipDockerRestart)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Step($name, [scriptblock]$action) {
  try { & $action; Write-Host "[OK] $name" -ForegroundColor Green }
  catch { Write-Warning "[WARN] $name: $($_.Exception.Message)" }
}

if (-not (Test-IsAdmin)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    "-NoProfile","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`""
  )
  exit 0
}

Step "Disable WSL GUI bridge" {
  Set-Content "$HOME\.wslconfig" "[wsl2]`nguiApplications=false`n" -Encoding ASCII
}

Step "Shutdown WSL and related bridge processes" {
  wsl --shutdown | Out-Null
  foreach($n in @("msrdc.exe","mstsc.exe","wsl.exe","wslhost.exe","wslrelay.exe","vmmemWSL.exe","vmmem.exe")) {
    taskkill /F /IM $n /T 2>$null | Out-Null
  }
}

Step "Set Corsair services manual/off" {
  foreach($s in @("CorsairService","CorsairCpuIdService")) {
    Stop-Service $s -Force -ErrorAction SilentlyContinue
    Set-Service  $s -StartupType Manual
  }
}

Step "Set Synapse services automatic/on + restart policy" {
  Set-Service "RzActionSvc" -StartupType Automatic
  Set-Service "Razer Synapse Service" -StartupType Automatic
  Start-Service "RzActionSvc"
  Start-Service "Razer Synapse Service"
  sc.exe failure "Razer Synapse Service" reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
  sc.exe failure "RzActionSvc" reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
}

Step "Register Snipaste autostart task" {
  $exe = @(
    "$env:LOCALAPPDATA\Programs\Snipaste\Snipaste.exe",
    "C:\Program Files\Snipaste\Snipaste.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $exe) { throw "Snipaste.exe not found." }

  $a = New-ScheduledTaskAction -Execute $exe
  $t = New-ScheduledTaskTrigger -AtLogOn
  $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName "Snipaste_Autostart" -Action $a -Trigger $t -Settings $s -RunLevel Highest -Force | Out-Null
}

Step "Kill non-MCP AmazonQ node process" {
  Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -like "*\aws\toolkits\language-servers\AmazonQ\*" -or
    [string]$_.CommandLine -like "*aws-lsp-codewhisperer*"
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

if (-not $SkipDockerRestart) {
  Step "Restart Docker Desktop stack" {
    taskkill /F /IM "Docker Desktop.exe" /T 2>$null | Out-Null
    taskkill /F /IM "com.docker.backend.exe" /T 2>$null | Out-Null
    Stop-Service com.docker.service -ErrorAction SilentlyContinue
    Start-Service com.docker.service
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  }
}

Step "Wait for Docker and set desktop-linux context" {
  $ready = $false
  foreach($i in 1..45) {
    docker version *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) { throw "Docker engine not ready." }
  docker context use desktop-linux | Out-Null
}

Step "Remove non-MCP containers" {
  docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}" | ForEach-Object {
    $p = $_ -split "\|",3
    if ($p.Count -eq 3) {
      if (($p[1] -notmatch "(?i)mcp") -and ($p[2] -notmatch "(?i)mcp")) {
        docker rm -f $p[0] | Out-Null
      }
    }
  }
}

Step "Show running containers" {
  docker ps --format "table {{.Names}}`t{{.Image}}`t{{.Status}}"
}

Write-Host "Done."
exit 0
