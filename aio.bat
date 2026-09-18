@echo off
npm run build:aio && del dist\assets\*.js && del dist\assets\*.css && rmdir dist\assets