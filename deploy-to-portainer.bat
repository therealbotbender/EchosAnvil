@echo off
REM Deployment script for Portainer (Windows version)
REM Run this on your server before deploying the stack in Portainer

echo ======================================
echo EchosAnvil Bot - Portainer Deployment
echo ======================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo Error: Docker is not installed or not running!
    pause
    exit /b 1
)

REM Check if we're in the right directory
if not exist "Dockerfile" (
    echo Error: Dockerfile not found. Are you in the right directory?
    pause
    exit /b 1
)

echo Step 1: Pulling latest code from GitHub...
git pull
if errorlevel 1 (
    echo Warning: Git pull failed. Continuing with existing code...
)

echo.
echo Step 2: Building Docker image...
docker build -t echosanvil-bot:latest .
if errorlevel 1 (
    echo Error: Docker build failed!
    pause
    exit /b 1
)

echo.
echo Step 3: Verifying image was created...
docker images echosanvil-bot:latest
if errorlevel 1 (
    echo Error: Image verification failed!
    pause
    exit /b 1
)

echo.
echo ======================================
echo Build complete!
echo ======================================
echo.
echo Next steps:
echo 1. Go to your Portainer UI
echo 2. Stacks -^> Add stack
echo 3. Name: echosanvil-bot
echo 4. Paste contents of portainer-stack.yml
echo 5. Add environment variables:
echo    - DISCORD_TOKEN
echo    - CLIENT_ID
echo    - GUILD_ID (optional)
echo 6. Click 'Deploy the stack'
echo.
echo The stack will use the image: echosanvil-bot:latest
echo.
pause
