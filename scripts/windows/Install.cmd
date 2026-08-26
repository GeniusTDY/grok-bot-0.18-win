@echo off
setlocal

set "SOURCE_DIR=%~dp0"
set "INSTALL_DIR=%LOCALAPPDATA%\Programs\GrokBot018Reconstructed"

if "%LOCALAPPDATA%"=="" (
  echo LOCALAPPDATA is unavailable.
  exit /b 1
)

if not exist "%SOURCE_DIR%Grok Bot 0.18 Reconstructed.exe" (
  echo Grok Bot executable is missing from this extracted release directory.
  exit /b 1
)

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
robocopy "%SOURCE_DIR%" "%INSTALL_DIR%" /E /COPY:DAT /DCOPY:DAT /R:2 /W:1
if errorlevel 8 (
  echo Installation failed. Close Grok Bot and try again.
  exit /b 1
)

cscript.exe //nologo "%INSTALL_DIR%\Create Desktop Shortcut.vbs" "%INSTALL_DIR%"
if errorlevel 1 exit /b 1

echo.
echo Grok Bot was installed successfully.
echo Use the desktop shortcut: Grok Bot 0.18 Reconstructed
exit /b 0
