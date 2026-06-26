@echo off
echo ===================================================
echo        CosmicDashboard - WSL Launcher
echo ===================================================
echo.

echo Checking WSL installation...
wsl --list --quiet >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: WSL is not installed or not configured.
    echo Please install WSL from Microsoft Store or run: wsl --install
    pause
    exit /b
)

echo.
echo Starting backend server using WSL Python...
echo (Press Ctrl+C to stop)
echo.

REM Change to the WSL path and run the launcher
REM Use wslpath to convert current directory to WSL path dynamically
for /f "delims=" %%i in ('wsl wslpath -a "%cd%"') do set WSL_PATH=%%i
wsl bash -c "cd \"%WSL_PATH%\" && chmod +x launch_cosmic.sh && ./launch_cosmic.sh"

pause

@REM Made with Bob
