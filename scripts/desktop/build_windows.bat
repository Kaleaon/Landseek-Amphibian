@echo off
REM Build Amphibian Desktop for Windows
REM Output: dist\amphibian-win.exe

echo 🔨 Building Amphibian Desktop for Windows...
echo ============================================

cd /d "%~dp0\..\..\desktop"

REM Install dependencies
echo 📦 Installing dependencies...
call npm install

REM Create dist directory
if not exist dist mkdir dist

REM Build for Windows
echo 🪟 Building Windows executable...
call npm run build:win

echo.
echo ✅ Build complete!
echo ==================
echo Output: dist\amphibian-win.exe

pause
