@echo off
if /I "%~1"=="aio"  (
    npm run build:aio && del dist\assets\*.js && del dist\assets\*.css && rmdir dist\assets
) else if /I "%~1"=="exe"  (
   aio aio && npm run build:exe
) else if /I "%~1"=="build"  (
   sh vite build
) else (
    npm run build
)