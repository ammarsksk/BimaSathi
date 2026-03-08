param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$SamArgs
)

$ErrorActionPreference = "Stop"

if (-not $SamArgs -or $SamArgs.Count -eq 0) {
    Write-Error "Usage: .\\scripts\\sam.ps1 <sam arguments>"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot ".sam-runtime"
$sessionId = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$sessionRoot = Join-Path $runtimeRoot $sessionId
$localAppData = Join-Path $sessionRoot "appdata"
$localTemp = Join-Path $sessionRoot "temp"
$samMetadataDir = Join-Path $localAppData "AWS SAM"

foreach ($path in @($runtimeRoot, $sessionRoot, $localAppData, $localTemp, $samMetadataDir)) {
    if (-not (Test-Path -LiteralPath $path)) {
        New-Item -ItemType Directory -Path $path | Out-Null
    }
}

$env:APPDATA = $localAppData
$env:LOCALAPPDATA = $localAppData
$env:TEMP = $localTemp
$env:TMP = $localTemp
$env:SAM_CLI_TELEMETRY = "0"
$env:AWS_SAM_CLI_TELEMETRY = "0"

$envFilePath = Join-Path $repoRoot ".env"
$fileEnv = @{}
if (Test-Path -LiteralPath $envFilePath) {
    foreach ($line in Get-Content -Path $envFilePath) {
        if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
            $value = $matches[2].Trim()
            if (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
            ) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $fileEnv[$matches[1]] = $value
        }
    }
}

function Get-ConfiguredValue {
    param(
        [string[]]$Names
    )

    foreach ($name in $Names) {
        $envValue = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($envValue)) {
            return $envValue
        }

        if ($fileEnv.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($fileEnv[$name])) {
            return $fileEnv[$name]
        }
    }

    return $null
}

$awsRegion = Get-ConfiguredValue -Names @("AWS_REGION", "AWS_DEFAULT_REGION")
if (-not [string]::IsNullOrWhiteSpace($awsRegion)) {
    $env:AWS_REGION = $awsRegion
    $env:AWS_DEFAULT_REGION = $awsRegion
}

$mappedParameters = @(
    @{ Parameter = "MetaAccessToken"; Names = @("META_ACCESS_TOKEN") },
    @{ Parameter = "MetaPhoneNumberId"; Names = @("META_PHONE_NUMBER_ID") },
    @{ Parameter = "MetaVerifyToken"; Names = @("META_VERIFY_TOKEN") },
    @{ Parameter = "MetaAppSecret"; Names = @("META_APP_SECRET") },
    @{ Parameter = "TwilioAccountSid"; Names = @("TWILIO_ACCOUNT_SID") },
    @{ Parameter = "TwilioAuthToken"; Names = @("TWILIO_AUTH_TOKEN") },
    @{ Parameter = "TwilioPhoneNumber"; Names = @("TWILIO_PHONE_NUMBER", "TWILIO_WHATSAPP_NUMBER") },
    @{ Parameter = "PollyRegion"; Names = @("POLLY_REGION") },
    @{ Parameter = "TranscribeRegion"; Names = @("TRANSCRIBE_REGION") },
    @{ Parameter = "NodeEnvironment"; Names = @("NODE_ENV") }
)

$commandName = $SamArgs[0]
$hasParameterOverrides = $SamArgs -contains "--parameter-overrides"
$resolvedOverrides = @()
$defaultParameterOverrides = @(
    "BedrockRegion=us-east-1",
    "BedrockModelId=us.amazon.nova-pro-v1:0"
)

if (-not $hasParameterOverrides -and $commandName -in @("build", "deploy", "sync")) {
    $resolvedOverrides += $defaultParameterOverrides

    foreach ($mapping in $mappedParameters) {
        $value = Get-ConfiguredValue -Names $mapping.Names
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $resolvedOverrides += "$($mapping.Parameter)=$value"
        }
    }

    if ($resolvedOverrides.Count -gt 0) {
        $SamArgs += "--parameter-overrides"
        $SamArgs += $resolvedOverrides
    }
}

Push-Location $repoRoot
try {
    & sam @SamArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
