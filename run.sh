#!/usr/bin/env sh
# Factory3D 바로 실행 (macOS·Linux) — DB 설치 없이. 필요: Java 17+ , Node 20+
# 처음 켜면 저장소의 db-snapshot/ 이 내장 DB(.local/) 로 들어갑니다. 주소: http://localhost:8080
set -e
cd "$(dirname "$0")"
PORT="${F3D_PORT:-8080}"
if [ ! -d web/node_modules ]; then
  echo "[1/3] 화면 패키지 설치 (처음 한 번)..."
  (cd web && npm ci)
fi
echo "[2/3] 화면 빌드..."
(cd web && npm run build)
echo "[3/3] 서버 시작 (내장 DB) — 준비되면 http://localhost:$PORT 를 여세요. 끄려면 Ctrl+C"
cd server
chmod +x gradlew
exec ./gradlew bootRun --args="--spring.profiles.active=embedded"
