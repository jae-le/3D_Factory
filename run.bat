@echo off
chcp 65001 >nul
rem Factory3D 바로 실행 (Windows) — DB 설치 없이. 필요: Java 17+ , Node 20+
rem 처음 켜면 저장소의 db-snapshot/ 이 내장 DB(.local/) 로 들어갑니다. 주소: http://localhost:8080
setlocal
cd /d "%~dp0"
if "%F3D_PORT%"=="" set F3D_PORT=8080

if not exist web\node_modules (
  echo [1/3] 화면 패키지 설치 ^(처음 한 번^)...
  pushd web && call npm ci || (popd & exit /b 1)
  popd
)
echo [2/3] 화면 빌드...
pushd web && call npm run build || (popd & exit /b 1)
popd

echo [3/3] 서버 시작 ^(내장 DB^) — 준비되면 브라우저가 열립니다. 끄려면 Ctrl+C
start "" /b powershell -NoProfile -Command "$u='http://localhost:%F3D_PORT%'; for($i=0;$i -lt 180;$i++){ try { Invoke-WebRequest -UseBasicParsing ($u + '/api/auth/me') -TimeoutSec 2 | Out-Null; break } catch { if($_.Exception.Response){ break } }; Start-Sleep 2 }; Start-Process $u"
cd server
call .\gradlew.bat bootRun --args="--spring.profiles.active=embedded"
