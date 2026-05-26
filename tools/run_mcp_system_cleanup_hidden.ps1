$script = Join-Path $PSScriptRoot "mcp_system_cleanup.ps1"
Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @(
  "-NoProfile","-ExecutionPolicy","Bypass","-File","`"$script`""
)
