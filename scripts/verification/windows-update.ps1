$ErrorActionPreference = 'Stop'
$repository = 'edmundokutuzov333/BarberOS'
$fromVersion = '1.0.15'
$latestText = gh api "repos/$repository/releases/latest"
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve published release' }
$latest = $latestText | ConvertFrom-Json
if ($latest.draft -or $latest.prerelease -or $latest.tag_name -notmatch '^native-v(\d+\.\d+\.\d+)$') { throw 'Expected stable published native release' }
$targetVersion = $Matches[1]
if ([version]$targetVersion -le [version]$fromVersion) { throw 'Upgrade requires a newer published version' }
if ($latest.target_commitish -notmatch '^[a-f0-9]{40}$') { throw 'Missing immutable target provenance' }
$targetName = "BarberOS-$targetVersion-Windows-x64-Setup.exe"
$targetAsset = @($latest.assets | Where-Object name -eq $targetName)
if ($targetAsset.Count -ne 1 -or $targetAsset[0].digest -notmatch '^sha256:([a-f0-9]{64})$') { throw 'Published target digest missing' }
$targetHash = $Matches[1]
$download = Join-Path $env:RUNNER_TEMP 'barberos-upgrade-source'
New-Item -ItemType Directory -Force -Path $download | Out-Null
gh release download "native-v$fromVersion" --repo $repository --pattern "BarberOS-$fromVersion-Windows-x64-Setup.exe" --pattern SHA256SUMS.txt --dir $download
if ($LASTEXITCODE -ne 0) { throw 'Previous immutable release download failed' }
$installer = Join-Path $download "BarberOS-$fromVersion-Windows-x64-Setup.exe"
$oldHash = (Get-FileHash -Algorithm SHA256 $installer).Hash.ToLower()
$expected = Get-Content (Join-Path $download SHA256SUMS.txt) | Where-Object { $_.EndsWith("  BarberOS-$fromVersion-Windows-x64-Setup.exe") }
if (!$expected -or !$expected.StartsWith("$oldHash  ")) { throw 'Previous installer checksum mismatch' }
$destination = Join-Path $env:RUNNER_TEMP 'BarberOS-upgrade-installed'
function Install-VerifiedPackage([string]$file) {
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $file
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.ArgumentList.Add('/S')
    $start.ArgumentList.Add('/currentuser')
    $start.ArgumentList.Add("/D=$destination")
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    if (!$process.Start() -or !$process.WaitForExit(180000) -or $process.ExitCode -ne 0) { throw 'NSIS installation/upgrade failed' }
}
Install-VerifiedPackage $installer
$executable = Join-Path $destination 'BarberOS.exe'
$env:BARBEROS_UPDATE_CONTEXT = Join-Path $env:RUNNER_TEMP 'barberos-update-context.json'
@{ fromVersion=$fromVersion; targetVersion=$targetVersion; targetCommit=$latest.target_commitish; expectedSha256=$targetHash; executable=$executable } | ConvertTo-Json | Set-Content -Encoding utf8 $env:BARBEROS_UPDATE_CONTEXT
node scripts/verification/windows-update.cjs download
if ($LASTEXITCODE -ne 0) { throw 'Actual update discovery/download failed' }
$context = Get-Content -Raw $env:BARBEROS_UPDATE_CONTEXT | ConvertFrom-Json
if ((Get-FileHash -Algorithm SHA256 $context.downloadedInstaller).Hash.ToLower() -ne $targetHash) { throw 'Downloaded update changed before installation' }
Install-VerifiedPackage $context.downloadedInstaller
$wsh = New-Object -ComObject WScript.Shell
foreach ($link in @((Join-Path ([Environment]::GetFolderPath('Programs')) 'BarberOS.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'BarberOS.lnk'))) {
    if (!(Test-Path $link) -or $wsh.CreateShortcut($link).TargetPath -ne $executable) { throw 'Upgrade did not preserve shortcuts' }
}
node scripts/verification/windows-update.cjs verify
if ($LASTEXITCODE -ne 0) { throw 'Updated executable or persistent profile validation failed' }
