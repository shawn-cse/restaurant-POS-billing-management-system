<#
.SYNOPSIS
    One-click installer and launcher for UrbanBite Restaurant POS & Billing Management System (Windows PowerShell).
.DESCRIPTION
    Builds the Docker images, launches PostgreSQL, NestJS Backend, and Next.js Web frontend,
    and checks service health. Optionally seeds the database with demo staff accounts.
.PARAMETER Demo
    Loads demo restaurant, menu items, and demo staff logins (Password: abc123).
#>
param(
    [switch]$Demo
)

$ErrorActionPreference = "Stop"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " UrbanBite Restaurant POS & Billing Management - Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check prerequisites
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not in PATH. Please install Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
}

try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon is not running" }
} catch {
    Write-Error "Docker Desktop is installed but not running. Please launch Docker Desktop and retry."
    exit 1
}

# 2. Setup .env file
if (-not (Test-Path ".env")) {
    Write-Host "[1/4] Creating .env file from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
} else {
    Write-Host "[1/4] Found existing .env file." -ForegroundColor Green
}

# 3. Build & start containers
Write-Host "[2/4] Building images and starting containers..." -ForegroundColor Yellow
docker compose up -d --build

# 4. Wait for health check
$hostPort = 8080
if (Test-Path ".env") {
    $portLine = Get-Content ".env" | Where-Object { $_ -match "^HOST_PORT=" } | Select-Object -First 1
    if ($portLine) {
        $hostPort = ($portLine -split "=")[1].Trim()
    }
}

Write-Host "[3/4] Waiting for backend and web application to come online..." -ForegroundColor Yellow
$ready = $false
for ($i = 1; $i -le 90; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$hostPort/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # continue waiting
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Warning "The application took longer than expected to report healthy. Check logs with: docker compose logs"
} else {
    Write-Host "[3/4] Application is healthy and online!" -ForegroundColor Green
}

# 5. Optional demo data
if ($Demo) {
    Write-Host "[4/4] Seeding demo restaurant data and staff accounts..." -ForegroundColor Yellow
    docker exec restaurant-pos-backend npx ts-node prisma/seed.ts
    Write-Host "[4/4] Demo data loaded!" -ForegroundColor Green
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " SUCCESS! UrbanBite Restaurant POS is ready." -ForegroundColor Green
Write-Host " Web URL: http://localhost:$hostPort" -ForegroundColor Cyan
if ($Demo) {
    Write-Host "`n Default Demo Staff Logins (Password: abc123):" -ForegroundColor Yellow
    Write-Host "   - Admin:         admin   / admin@gmail.com" -ForegroundColor White
    Write-Host "   - Manager:       manager / manager@gmail.com" -ForegroundColor White
    Write-Host "   - Cashier:       cashier / cashier@gmail.com" -ForegroundColor White
    Write-Host "   - Waiter:        waiter  / waiter@gmail.com" -ForegroundColor White
    Write-Host "   - Kitchen Staff: kitchen / kitchen@gmail.com" -ForegroundColor White
    Write-Host "`n (All accounts can log in using either username or email)" -ForegroundColor Cyan
} else {
    Write-Host " Create your restaurant administrator account at: http://localhost:$hostPort/signup" -ForegroundColor White
}
Write-Host "============================================================`n" -ForegroundColor Green
