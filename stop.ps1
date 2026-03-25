# PlanPulse - Script d'arret complet

Set-Location $PSScriptRoot

Write-Host "[PlanPulse] Arret en cours..." -ForegroundColor Red

# Lire les PIDs sauvegardes
$pidsFile = "$PSScriptRoot\.pids.json"
if (Test-Path $pidsFile) {
    $pids = Get-Content $pidsFile | ConvertFrom-Json
    foreach ($prop in @("ApiPid", "FrontPid")) {
        $pid = $pids.$prop
        if ($pid) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "  $prop (PID $pid) arrete" -ForegroundColor Yellow
            }
        }
    }
    Remove-Item $pidsFile -Force
}

# Kill par port en fallback
foreach ($port in 3001, 5173) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq Listen
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  Port $port - $($proc.ProcessName) (PID $($proc.Id)) arrete" -ForegroundColor Yellow
        }
    }
}

# Arreter Docker (garder les donnees)
Write-Host "  Arret des conteneurs Docker..." -ForegroundColor Yellow
docker compose stop 2>&1 | Out-Null

Write-Host "[OK] PlanPulse arrete" -ForegroundColor Green
Write-Host ""
Write-Host "  Pour relancer:           .\start.ps1" -ForegroundColor Yellow
Write-Host "  Pour relancer avec seed: .\start.ps1 -Seed" -ForegroundColor Yellow
Write-Host "  Pour reset complet:      .\start.ps1 -Fresh" -ForegroundColor Yellow
