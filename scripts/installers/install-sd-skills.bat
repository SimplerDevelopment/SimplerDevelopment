@echo off
rem
rem SimplerDevelopment skills - Windows installer
rem
rem Double-click this file in Explorer to install the SimplerDevelopment
rem Claude skills (sd-init, sd-create-page, sd-create-deck, etc.) into
rem %USERPROFILE%\.claude\skills\. Works with Claude Desktop and Claude Code.
rem
rem Requires Windows 10 build 17063+ (April 2018) — bundles curl + tar
rem natively. No PowerShell required.
rem
rem This installer is unsigned. SmartScreen may show "Windows protected
rem your PC" the first time — click "More info" then "Run anyway".

setlocal enabledelayedexpansion

set "BUNDLE_URL=https://simplerdevelopment.com/api/skills/bundle.tgz"
set "BUNDLE_SHA_URL=https://simplerdevelopment.com/api/skills/bundle.tgz.sha256"
set "SKILLS_DIR=%USERPROFILE%\.claude\skills"
set "TMP_TGZ=%TEMP%\sd-skills-bundle.tgz"
set "TMP_SHA=%TEMP%\sd-skills-bundle.tgz.sha256"

echo.
echo === SimplerDevelopment skills - Windows installer ===
echo.
echo Target:        %SKILLS_DIR%
echo Bundle source: %BUNDLE_URL%
echo.

rem Sanity check Windows version (curl + tar require Win10 1803+)
where curl >nul 2>&1 || (
  echo ERROR: curl.exe not found. Windows 10 build 17063 or newer is required.
  echo Update Windows and try again.
  pause
  exit /b 1
)
where tar >nul 2>&1 || (
  echo ERROR: tar.exe not found. Windows 10 build 17063 or newer is required.
  echo Update Windows and try again.
  pause
  exit /b 1
)

echo 1. Downloading skills bundle...
curl -fsSL "%BUNDLE_URL%" -o "%TMP_TGZ%"
if errorlevel 1 (
  echo ERROR: Download failed. Is the portal reachable?
  echo Try opening %BUNDLE_URL% in a browser.
  pause
  exit /b 1
)
echo    Downloaded.
echo.

echo 2. Verifying checksum...
curl -fsSL "%BUNDLE_SHA_URL%" -o "%TMP_SHA%" 2>nul
if errorlevel 1 (
  echo    WARNING: Checksum endpoint not reachable - skipping verification.
) else (
  rem Read first word of the .sha256 file (the expected hash)
  for /f "tokens=1" %%H in (%TMP_SHA%) do set "EXPECTED=%%H"
  rem Compute the actual hash via certutil (built into Windows)
  for /f "skip=1 tokens=*" %%H in ('certutil -hashfile "%TMP_TGZ%" SHA256 ^| findstr /v ":"') do (
    if not defined ACTUAL set "ACTUAL=%%H"
  )
  rem certutil prints in groups of 2 with spaces; strip them
  set "ACTUAL=!ACTUAL: =!"
  if /i not "!EXPECTED!"=="!ACTUAL!" (
    echo ERROR: Checksum mismatch.
    echo   expected: !EXPECTED!
    echo   actual:   !ACTUAL!
    echo Refusing to install - bundle may be tampered or partially downloaded.
    pause
    exit /b 1
  )
  echo    Checksum verified.
)
echo.

echo 3. Installing to %SKILLS_DIR%...
if not exist "%SKILLS_DIR%" mkdir "%SKILLS_DIR%"
tar -xzf "%TMP_TGZ%" -C "%SKILLS_DIR%"
if errorlevel 1 (
  echo ERROR: Extraction failed.
  pause
  exit /b 1
)
echo    Skills installed.
echo.

echo Installed skills:
for %%s in (sd-init sd-create-page sd-create-deck sd-create-email sd-create-survey ^
            sd-create-booking-page sd-create-website sd-build-html-embed sd-learn ^
            html-render-block) do (
  if exist "%SKILLS_DIR%\%%s\SKILL.md" (
    echo   [x] %%s
  ) else (
    echo   [ ] %%s  ^(MISSING - bundle may be incomplete^)
  )
)

echo.
echo === Next steps ===
echo.
echo 1. Configure the MCP server in Claude Desktop:
echo.
echo    Open  %%APPDATA%%\Claude\claude_desktop_config.json
echo    Add:
echo.
echo      {
echo        "mcpServers": {
echo          "simplerdevelopment": {
echo            "command": "npx",
echo            "args": [
echo              "-y", "mcp-remote",
echo              "https://^<your-tenant^>.simplerdevelopment.com/api/mcp"
echo            ]
echo          }
echo        }
echo      }
echo.
echo    Replace ^<your-tenant^> with your tenant subdomain (your account
echo    manager has this if you don't).
echo.
echo 2. Restart Claude Desktop.
echo.
echo 3. In Claude, say:   Run sd-init
echo.
echo    Claude will OAuth into your portal, pull your brand profile, and
echo    write a .sd\config.json into your current working directory. After
echo    that, all the other sd-* skills are ready to use.
echo.
echo Full quickstart:  %SKILLS_DIR%\CLIENT_QUICKSTART.md
echo.

del "%TMP_TGZ%" 2>nul
del "%TMP_SHA%" 2>nul

pause
endlocal
