$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$samScript = Join-Path $scriptRoot "sam.ps1"

$buildArgs = @("build", "--cached", "--parallel")
powershell -ExecutionPolicy Bypass -File $samScript @buildArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

powershell -ExecutionPolicy Bypass -File $samScript deploy --config-env default
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

powershell -ExecutionPolicy Bypass -File $samScript sync --watch --code --skip-deploy-sync --config-env default
exit $LASTEXITCODE
