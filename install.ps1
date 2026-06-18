param(
  [switch]$Silent,
  [switch]$Start,
  [switch]$Force,
  [Alias("Host")]
  [string]$HostName,
  [int]$Port,
  [string]$BinDir,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

for ($i = 0; $i -lt $RemainingArgs.Count; $i++) {
  $arg = $RemainingArgs[$i]
  switch -Regex ($arg) {
    '^--silent$' { $Silent = $true; continue }
    '^--start$' { $Start = $true; continue }
    '^--force$' { $Force = $true; continue }
    '^--host$' {
      $i++
      if ($i -ge $RemainingArgs.Count) { Write-Error "LLM-Dash: --host requires a value." }
      $HostName = $RemainingArgs[$i]
      continue
    }
    '^--host=(.+)$' { $HostName = $Matches[1]; continue }
    '^--port$' {
      $i++
      if ($i -ge $RemainingArgs.Count) { Write-Error "LLM-Dash: --port requires a value." }
      $Port = [int]$RemainingArgs[$i]
      continue
    }
    '^--port=(.+)$' { $Port = [int]$Matches[1]; continue }
    '^--bin-dir$' {
      $i++
      if ($i -ge $RemainingArgs.Count) { Write-Error "LLM-Dash: --bin-dir requires a value." }
      $BinDir = $RemainingArgs[$i]
      continue
    }
    '^--bin-dir=(.+)$' { $BinDir = $Matches[1]; continue }
    default { Write-Error "LLM-Dash: unknown installer option '$arg'." }
  }
}

$python = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
  $python = @("py", "-3")
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $python = @("python")
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
  $python = @("python3")
}

if (-not $python) {
  Write-Error "LLM-Dash: could not find py -3, python, or python3 on PATH. Install Python 3.10+ and retry."
}

$argsList = @("-m", "llm_dash", "install")
if ($Silent) { $argsList += "--silent" }
if ($Start) { $argsList += "--start" }
if ($Force) { $argsList += "--force" }
if ($HostName) { $argsList += @("--host", $HostName) }
if ($Port) { $argsList += @("--port", "$Port") }
if ($BinDir) { $argsList += @("--bin-dir", $BinDir) }

if ($python.Length -gt 1) {
  & $python[0] $python[1] @argsList
} else {
  & $python[0] @argsList
}
exit $LASTEXITCODE
