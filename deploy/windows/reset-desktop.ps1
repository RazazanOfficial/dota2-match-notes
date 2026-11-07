[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CompanionExe)
$ErrorActionPreference = "Stop"
$DotaCompanionPath = (Resolve-Path -LiteralPath $CompanionExe).Path
if ([IO.Path]::GetFileName($DotaCompanionPath) -ne "dota-notes-companion.exe") {
    throw "Use the companion executable built from this release."
}
$DotaSessionId = (Get-Process -Id $PID).SessionId
Get-Process -Name "dota-notes-desktop","Dota Notes","dota-notes-companion" -ErrorAction SilentlyContinue |
    Where-Object { $_.SessionId -eq $DotaSessionId } |
    Stop-Process -Force
Start-Sleep -Seconds 2
$DotaResetProcess = Start-Process -FilePath $DotaCompanionPath -ArgumentList "--reset-user-data" -Wait -PassThru
if ($DotaResetProcess.ExitCode -ne 0) {
    throw "Reset did not finish. Close Dota Notes and its WebView processes, then retry."
}
# Clear this product's orphaned Generic credentials too, if configuration was deleted earlier.
$DotaCredentialLines = & cmdkey.exe /list
foreach ($DotaCredentialLine in $DotaCredentialLines) {
    if ($DotaCredentialLine -match '(session-v1\.ir\.dota2notes\.desktop|[0-9a-fA-F-]{36}\.ir\.dota2notes\.companion)\s*$') {
        $DotaCredentialTarget = $Matches[1]
        & cmdkey.exe "/delete:$DotaCredentialTarget" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "A Dota Notes credential could not be removed." }
    }
}
$DotaIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
Get-ScheduledTask -TaskName "DotaNotes-Companion-*" -ErrorAction SilentlyContinue |
    Where-Object { $_.Principal.UserId -in @($DotaIdentity.Name,$DotaIdentity.User.Value) } |
    ForEach-Object {
        Stop-ScheduledTask -InputObject $_ -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -InputObject $_ -Confirm:$false
    }
$DotaPaths = @(
    (Join-Path $env:APPDATA "ir.dota2notes.desktop"),
    (Join-Path $env:LOCALAPPDATA "ir.dota2notes.desktop"),
    (Join-Path $env:APPDATA "Dota Notes"),
    (Join-Path $env:LOCALAPPDATA "Dota Notes"),
    (Join-Path $env:LOCALAPPDATA "DotaNotesShared")
)
foreach ($DotaPath in $DotaPaths) {
    if (Test-Path -LiteralPath $DotaPath) { throw "A product data folder still exists: $DotaPath" }
}
Write-Host "Dota Notes local data, asset cache, credentials and background task were cleared."
Write-Host "Steam, Dota 2, game replays and the server account were preserved."
