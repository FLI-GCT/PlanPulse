# PlanPulse - Script de demarrage complet
# Usage:
#   .\start.ps1            # Lancement normal
#   .\start.ps1 -Seed      # Avec re-seed de la BDD
#   .\start.ps1 -Fresh     # Kill + seed + restart complet

param(
    [switch]$Seed,
    [switch]$Fresh
)

if ($Fresh) { $Seed = $true }

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Log($msg)  { Write-Host "[PlanPulse] $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }

# ─── 1. Kill tout ────────────────────────────────────────
Log "Arret des processus existants..."

foreach ($port in 3001, 5173) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq Listen
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Warn "Port $port - process $($proc.ProcessName) (PID $($proc.Id)) tue"
        }
    }
}
Ok "Processus arretes"

# ─── 2. Docker (PostgreSQL + Redis) ─────────────────────
Log "Demarrage PostgreSQL + Redis..."
docker compose up -d postgres redis 2>&1 | Out-Null

for ($i = 0; $i -lt 30; $i++) {
    $ready = docker exec planpulse-postgres pg_isready -U planpulse 2>&1
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
}
Ok "PostgreSQL + Redis prets"

# ─── 3. Prisma generate ─────────────────────────────────
Log "Generation du client Prisma..."
Push-Location database
$env:DATABASE_URL = "postgres://planpulse:planpulse_dev@localhost:5432/planpulse"
npx prisma generate 2>&1 | Out-Null
Ok "Client Prisma genere"

# ─── 4. Migration ────────────────────────────────────────
Log "Application des migrations..."
npx prisma migrate deploy 2>&1 | Out-Null
Ok "Migrations appliquees"

# ─── 5. Seed (optionnel) ─────────────────────────────────
if ($Seed) {
    Log "Seed de la base de donnees..."
    npx tsx prisma/seed.ts
    Ok "Seed termine"
}
Pop-Location

# ─── 6. Build API ────────────────────────────────────────
Log "Build de l'API NestJS..."
Push-Location api
npx nest build 2>&1 | Out-Null
Ok "API buildee"

# ─── 7. Lancement API (background) ───────────────────────
Log "Demarrage de l'API sur http://localhost:3001..."
$apiJob = Start-Process node -ArgumentList "dist/main.js" -PassThru -NoNewWindow -RedirectStandardOutput "$PSScriptRoot\.api-out.log" -RedirectStandardError "$PSScriptRoot\.api-err.log"
Pop-Location

for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-RestMethod http://localhost:3001/v1/api/kpi -ErrorAction SilentlyContinue | Out-Null
        break
    } catch { Start-Sleep -Seconds 1 }
}
Ok "API demarree (PID $($apiJob.Id)) - Swagger: http://localhost:3001/v1/api/docs"

# ─── 8. Lancement Frontend (background) ──────────────────
Log "Demarrage du frontend Vite sur http://localhost:5173..."
Push-Location frontend
$frontJob = Start-Process cmd -ArgumentList "/c","cd /d `"$PSScriptRoot\frontend`" && npx vite --host" -PassThru -NoNewWindow -RedirectStandardOutput "$PSScriptRoot\.front-out.log" -RedirectStandardError "$PSScriptRoot\.front-err.log"
Pop-Location
Start-Sleep -Seconds 3
Ok "Frontend demarre (PID $($frontJob.Id)) - http://localhost:5173"

# ─── 9. Sauvegarder les PIDs ─────────────────────────────
@{
    ApiPid     = $apiJob.Id
    FrontPid   = $frontJob.Id
} | ConvertTo-Json | Set-Content "$PSScriptRoot\.pids.json"

# ─── 10. Resume ──────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  PlanPulse demarre avec succes !" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:   " -NoNewline; Write-Host "http://localhost:5173" -ForegroundColor Blue
Write-Host "  API:        " -NoNewline; Write-Host "http://localhost:3001/v1/api/docs" -ForegroundColor Blue
Write-Host "  PostgreSQL:  localhost:5432"
Write-Host "  Redis:       localhost:6379"
Write-Host ""
Write-Host "  API PID:      $($apiJob.Id)"
Write-Host "  Frontend PID: $($frontJob.Id)"
Write-Host ""
Write-Host "  Pour arreter: .\stop.ps1" -ForegroundColor Yellow
Write-Host ""
