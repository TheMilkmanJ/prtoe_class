import os
import sys
import shutil
import subprocess
from pathlib import Path

# Paths
project_dir = Path(__file__).resolve().parent.parent
assets_dir = project_dir / "dashboard" / "assets"
assets_dir.mkdir(parents=True, exist_ok=True)

dest_ico = assets_dir / "galaxy_icon.ico"
dest_png = assets_dir / "galaxy_icon.png"

# Automatically ensure all shell scripts are executable
scripts_to_chmod = ["launch_cosmic.sh", "wait_for_build.sh"]
for script_name in scripts_to_chmod:
    script_path = project_dir / script_name
    if script_path.exists():
        try:
            os.chmod(script_path, 0o755)
            print(f"Set executable permissions for: {script_path}")
        except Exception as e:
            print(f"Failed to set permissions for {script_name}: {e}")

def to_windows_path(linux_path: Path) -> str:
    parts = list(linux_path.parts)
    if len(parts) > 2 and parts[1] == 'mnt' and parts[2] == 'c':
        return "C:\\" + "\\".join(parts[3:])
    return str(linux_path)

# 1. Create Windows Desktop Shortcut (.lnk file) via PowerShell
# Dynamically query Windows for the active Desktop path (handles OneDrive and custom paths)
desktop_res = subprocess.run(
    ["powershell.exe", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
    capture_output=True,
    text=True,
)
windows_desktop = None
if desktop_res.returncode == 0 and desktop_res.stdout.strip():
    wsl_res = subprocess.run(
        ["wslpath", "-u", desktop_res.stdout.strip()],
        capture_output=True,
        text=True,
    )
    if wsl_res.returncode == 0:
        windows_desktop = Path(wsl_res.stdout.strip())

# Fallback: Scan /mnt/c/Users for valid Desktop directories if PowerShell query failed
if not windows_desktop or not windows_desktop.exists():
    users_dir = Path("/mnt/c/Users")
    if users_dir.exists():
        for user_folder in users_dir.iterdir():
            if user_folder.is_dir() and user_folder.name not in ("All Users", "Default", "Default User", "Public"):
                # Try OneDrive Desktop first
                onedrive_desktop = user_folder / "OneDrive" / "Desktop"
                if onedrive_desktop.exists():
                    windows_desktop = onedrive_desktop
                    break
                # Try standard Desktop
                std_desktop = user_folder / "Desktop"
                if std_desktop.exists():
                    windows_desktop = std_desktop
                    break

if windows_desktop and windows_desktop.exists():
    shortcut_path = windows_desktop / "CosmicDashboard.lnk"
    
    # Store the icon in OneDrive Desktop CosmicDashboardAssets directory
    windows_app_dir = windows_desktop / "CosmicDashboardAssets"
    try:
        windows_app_dir.mkdir(parents=True, exist_ok=True)
        local_win_ico = windows_app_dir / "galaxy_icon_v3.ico"
        shutil.copy(dest_ico, local_win_ico)
        print(f"Copied icon to Windows directory: {local_win_ico}")
        
        # Convert to Windows-style paths
        win_shortcut_str = to_windows_path(shortcut_path)
        win_icon_str = to_windows_path(local_win_ico)
        
        # PowerShell script to create WScript.Shell LNK shortcut running WSL
        # Targets wsl.exe directly to run bash and start the launcher
        powershell_cmd = f"""
$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut("{win_shortcut_str}")
$shortcut.TargetPath = "wsl.exe"
$shortcut.Arguments = "bash -c 'cd {project_dir.as_posix()} && ./launch_cosmic.sh'"
$shortcut.IconLocation = "{win_icon_str}"
$shortcut.Description = "Launch CosmicDashboard in WSL prtoe_gold environment"
$shortcut.WorkingDirectory = "C:\\"
$shortcut.Save()
"""
        # Run powershell.exe from WSL to write the shortcut on the Windows Desktop
        res = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", powershell_cmd],
            capture_output=True,
            text=True
        )
        if res.returncode == 0:
            print(f"Windows Desktop LNK shortcut created at: {shortcut_path}")
            # Clean up old .url file if it exists to avoid confusion
            old_url_shortcut = windows_desktop / "CosmicDashboard.url"
            if old_url_shortcut.exists():
                old_url_shortcut.unlink()
        else:
            print(f"PowerShell shortcut creation failed: {res.stderr}")
            # Fallback to .url file if .lnk creation failed
            url_content = f"""[InternetShortcut]
URL=http://localhost:8000/
IconIndex=0
IconFile={win_icon_str}
"""
            fallback_url = windows_desktop / "CosmicDashboard.url"
            with open(fallback_url, 'w') as f:
                f.write(url_content)
            print(f"Created fallback URL shortcut at: {fallback_url}")
    except Exception as e:
        print(f"Failed to copy icon or create Windows shortcut: {e}")
else:
    print("Windows Desktop path not found. Skipping Windows shortcut creation.")

# 2. Create Linux Desktop Shortcut (.desktop file)
linux_desktop = Path.home() / "Desktop"
if linux_desktop.exists():
    desktop_file = linux_desktop / "cosmic-dashboard.desktop"
    desktop_content = f"""[Desktop Entry]
Version=1.0
Type=Application
Name=CosmicDashboard
Comment=Launch CosmicDashboard Web UI
Exec=xdg-open http://localhost:8000/
Icon={dest_png}
Terminal=false
Categories=Science;Astronomy;Education;
"""
    try:
        with open(desktop_file, 'w') as f:
            f.write(desktop_content)
        os.chmod(desktop_file, 0o755)
        print(f"Linux Desktop shortcut created at: {desktop_file}")
    except Exception as e:
        print(f"Failed to create Linux shortcut: {e}")

print("Desktop icon deployment complete!")
