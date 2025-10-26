@echo off

REM ����Ƿ�װ�� nodejs / Check if nodejs is installed
where node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo ��ǰ�豸δ��װ Nodejs, �밲װ�����ԡ�/ Nodejs is not installed on the current device, please install it and try again.
    echo �ɲο� ./nodejs-setup.md ��װNodejs��/ Please refer to./nodejs-setup.md to install Nodejs.
    pause
    EXIT /b 1
) ELSE (
    echo Node.js �Ѱ�װ���汾��Ϣ:  / Node.js is already installed, version info: 
    node -v
)

REM ��װ���� / Install dependencies
echo ��װ��Ŀ����... / Installing project dependencies...
call npm i

REM ������Ŀ / Start the project
echo ������Ŀ... / Starting the project...
npm run dev
