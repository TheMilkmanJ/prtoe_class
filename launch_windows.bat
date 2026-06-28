@echo off
echo ===================================================
echo        CosmicDashboard - One-Click Launcher
echo ===================================================
echo.

echo Checking for Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not running.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop/
    pause
    exit /b
)

echo Building Docker container (this may take a few minutes the first time)...
docker build -t cosmic-dashboard .

echo.
echo Starting the CosmicDashboard container on http://localhost:8000 ...
docker run --rm --name cosmic-dashboard -p 8000:8000 -v "%cd%\chains:/app/chains" cosmic-dashboard

echo.
echo IMPORTANT: Open this in your browser for best results (avoids file:// auth issues):
echo     http://localhost:8000
echo.
echo If it prompts for login, use the DASHBOARD_USER / DASHBOARD_PASS you set
echo (or the ones printed by the backend on first start).
echo.
echo (To stop: Ctrl+C in this window or close the container.)
pause