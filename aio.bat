@echo off
npm install && npm run build:aio && del dist\assets\*.js && dist\assets\*.css && rmdir dist\assets
