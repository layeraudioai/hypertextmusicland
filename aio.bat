@echo off
if /I "%~1"=="aio"  (
    npm run build:aio && del dist\assets\*.js && del dist\assets\*.css && rmdir dist\assets && exit
) else (
    npm run build && exit
)