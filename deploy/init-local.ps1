[CmdletBinding()]
param(
    [string]$AdminUser = "admin",
    [string]$AdminPassword,
    [string]$PublicSiteURL = "",
    [string]$PublicAPIURL = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

if (Test-Path -LiteralPath $envPath) {
    throw ".env already exists. It was not changed. Edit it manually if you need different settings."
}

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
        $passwordBytes = New-Object byte[] 18
        $rng.GetBytes($passwordBytes)
        $AdminPassword = [Convert]::ToBase64String($passwordBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    }

    $secretBytes = New-Object byte[] 48
    $rng.GetBytes($secretBytes)
    $sessionSecret = [Convert]::ToBase64String($secretBytes)
}
finally {
    $rng.Dispose()
}

$envContent = @"
ADDR=:8080
ADMIN_USER=$AdminUser
ADMIN_PASS=$AdminPassword
SESSION_SECRET=$sessionSecret
ADMIN_BASE_PATH=
PUBLIC_BASE_URL=/
PUBLIC_SITE_URL=$PublicSiteURL
PUBLIC_API_URL=$PublicAPIURL
PUBLIC_CORS_ORIGINS=$PublicSiteURL
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, $envContent, $utf8NoBom)

foreach ($relativePath in @("data", "content/posts", "content/friends", "content/tags", "static/uploads", "published")) {
    $null = New-Item -ItemType Directory -Path (Join-Path $projectRoot $relativePath) -Force
}

Write-Host "Created local-only .env and runtime directories."
Write-Host "Admin user: $AdminUser"
Write-Host "Admin password: $AdminPassword"
Write-Host "Store this password securely; .env is excluded from Git."
