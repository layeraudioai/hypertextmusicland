@echo off
if /I "%~1"=="aio"  (
    npm run build:aio && del dist\assets\*.js && del dist\assets\*.css && rmdir dist\assets
) else (
    npm run build
)