@echo off
REM Clean Gatsby cache
call gatsby clean

REM Remove the UI directory
rmdir /s /q ..\src\magentic_ui\backend\web\ui

REM Set the PREFIX_PATH_VALUE environment variable (adjust if needed)
set PREFIX_PATH_VALUE=

REM Build the Gatsby project with prefix paths
call gatsby build --prefix-paths

REM Mirror the 'public' directory to the destination
robocopy public ..\src\magentic_ui\backend\web\ui /MIR

REM Check robocopy exit code
IF %ERRORLEVEL% GEQ 8 (
    echo Robocopy failed with exit code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

