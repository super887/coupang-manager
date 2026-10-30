@echo off
chcp 65001 > nul
title 쿠팡매니저 확장프로그램 최신버전 업데이트

echo =======================================================
echo    쿠팡매니저 확장프로그램 최신버전 자동 업데이트 시작
echo =======================================================
echo.
echo [1/3] 깃허브(GitHub)에서 최신 코드를 다운로드하는 중...

set "ZIP_URL=https://github.com/super887/coupang-manager/archive/refs/heads/main.zip"
set "TEMP_ZIP=%TEMP%\coupang-manager-main.zip"
set "TEMP_DIR=%TEMP%\coupang-manager-extracted"
set "TARGET_DIR=%~dp0extension"

:: 만약 배포 파일이 extension 폴더 안에 있다면 상위 폴더를 기준으로 잡거나 현재 위치 판단
if not exist "%TARGET_DIR%" (
    if exist "%~dp0manifest.json" (
        set "TARGET_DIR=%~dp0"
    ) else (
        set "TARGET_DIR=%~dp0extension"
    )
)

:: 임시 파일 및 폴더 정리
if exist "%TEMP_ZIP%" del /f /q "%TEMP_ZIP%"
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"

:: PowerShell을 이용해 GitHub 최신 zip 다운로드 및 압축 해제
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('%ZIP_URL%', '%TEMP_ZIP%'); Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"

if not exist "%TEMP_DIR%\coupang-manager-main\extension" (
    echo.
    echo [오류] 최신 파일을 다운로드하지 못했습니다. 인터넷 연결을 확인해주세요.
    pause
    exit /b 1
)

echo.
echo [2/3] 최신 확장프로그램 파일 적용 중...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

xcopy "%TEMP_DIR%\coupang-manager-main\extension\*" "%TARGET_DIR%\" /E /Y /Q > nul

:: 임시 파일 정리
if exist "%TEMP_ZIP%" del /f /q "%TEMP_ZIP%"
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"

echo.
echo [3/3] 업데이트가 완료되었습니다!
echo =======================================================
echo   * 업데이트된 경로: %TARGET_DIR%
echo.
echo   [마무리 안내]
echo   1. 크롬 주소창에 chrome://extensions 접속
echo   2. '쿠팡매니저' 카드의 새로고침(🔄) 버튼을 1번 눌러주세요!
echo   3. 버전이 1.1.0 (최신)으로 표시되면 정상 완료입니다.
echo =======================================================
echo.
pause
