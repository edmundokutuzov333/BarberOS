$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem apps/desktop/release/*-Windows-x64-Setup.exe | Select-Object -First 1
if (!$installer) { throw 'Windows installer not produced' }
$destination = Join-Path $env:RUNNER_TEMP 'BarberOS-installed'
Write-Output 'Installing NSIS package into the disposable test profile'
# Start-Process -Wait waits for the entire descendant tree, including the app launched after installation.
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName = $installer.FullName
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.ArgumentList.Add('/S')
$start.ArgumentList.Add('/currentuser')
$start.ArgumentList.Add("/D=$destination")
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $start
if (!$process.Start()) { throw 'Could not start NSIS installer' }
Write-Output "Started NSIS process $($process.Id)"
if (!$process.WaitForExit(180000)) { throw 'NSIS installer did not exit within three minutes' }
Write-Output "NSIS process exited: $($process.ExitCode)"
if ($process.ExitCode -ne 0) { throw "NSIS failed: $($process.ExitCode)" }
$executable = Join-Path $destination 'BarberOS.exe'
if (!(Test-Path $executable)) { throw 'Installed executable missing' }
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'BarberOS.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'BarberOS.lnk'
$wsh = New-Object -ComObject WScript.Shell
foreach ($link in @($startMenu, $desktop)) {
    if (!(Test-Path $link)) { throw "Installer shortcut missing: $link" }
    $shortcut = $wsh.CreateShortcut($link)
    if ($shortcut.TargetPath -ne $executable) { throw "Invalid shortcut target: $link" }
}
Write-Output 'PASS | installed executable and both shortcuts match'
New-Item -ItemType Directory -Force -Path apps/desktop/release/runtime-evidence | Out-Null
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($executable)
if (!$icon) { throw 'Application ICO is missing from installed executable' }
$icon.ToBitmap().Save((Join-Path $PWD 'apps/desktop/release/runtime-evidence/windows-icon.png'))
$icon.Dispose()
Write-Output 'PASS | installed application icon extracted; starting runtime acceptance'
$env:BARBEROS_EXECUTABLE = $executable
$env:BARBEROS_EVIDENCE = Join-Path $PWD 'apps/desktop/release/runtime-evidence'
node apps/desktop/test/runtime.cjs
if ($LASTEXITCODE -ne 0) { throw 'Installed Windows application failed runtime acceptance' }
node apps/desktop/test/updater-runtime.cjs
if ($LASTEXITCODE -ne 0) { throw 'Installed Windows updater policy failed acceptance' }
Write-Output 'PASS | NSIS installation, desktop/Start Menu shortcuts and installed runtime'
