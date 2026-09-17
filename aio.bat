@echo off
npm install && npm run build:aio && del dist\assets\*.css && dist\assets\*.css && rmdir dist\assets
