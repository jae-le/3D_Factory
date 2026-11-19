#!/usr/bin/env sh
# 지금 내장 DB(.local/) + 업로드 파일을 db-snapshot/ 으로 내보냅니다 → 커밋해서 다른 PC 와 공유.
# 서버(run.sh)를 끈 뒤 실행하세요. 비밀번호·API 키 같은 비밀은 빠집니다 (모든 계정 비밀번호 = Factory3d1!).
# 내장 DB 대신 PostgreSQL 에서 내보내려면: F3D_PROFILE=default 와 F3D_DB_URL·F3D_DATA_DIR 를 지정
set -e
cd "$(dirname "$0")/../server"
exec ./gradlew bootRun --args="--spring.profiles.active=${F3D_PROFILE:-embedded} --factory3d.snapshot.export=true --factory3d.live.enabled=false --server.port=0"
