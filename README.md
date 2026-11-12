# Factory3D

2D 도면을 3D 공장으로 불러오고, 도면별 객체 배치 · 실시간 상황판 · 생산 동작 · AI 챗봇 · 관리자 기능을 갖춘 웹 플랫폼.
설계: `docs/superpowers/specs/2026-11-12-factory3d-platform-design.md`

## 준비 (한 번)
- Node 20+, Java 17+ (빌드가 JDK 21 을 자동으로 받음), PostgreSQL 17 (localhost:5433)
- DB·계정 만들기:
  ```
  "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5433 -U postgres -f scripts/setup-db.sql
  ```
- `cd web && npm install`

## 개발 실행
```
cd server && ./gradlew bootRun      # http://localhost:8080 (API)
cd web && npm run dev               # http://localhost:5200 (화면, /api 는 8080 으로)
```
처음 실행하면 관리자 `admin` 이 만들어집니다. 비밀번호는 환경 변수 `F3D_ADMIN_PASSWORD`, 비우면 서버 로그에 한 번 출력. 첫 로그인 때 변경해야 합니다.

## 배포 (jar 하나 + PostgreSQL)
```
cd server && ./gradlew bootJar      # build/libs/factory3d.jar (화면 포함)
java -jar factory3d.jar             # Java 21
```
| 환경 변수 | 기본값 |
|---|---|
| `F3D_DB_URL` | `jdbc:postgresql://localhost:5433/factory3d` |
| `F3D_DB_USER` / `F3D_DB_PASSWORD` | `factory3d` / `factory3d` |
| `F3D_PORT` | `8080` |
| `F3D_DATA_DIR` | `../data` (업로드 파일) |
| `F3D_ADMIN_PASSWORD` | 비면 임의 생성 |

## 테스트
```
cd server && ./gradlew test         # 테스트 DB factory3d_test 를 매번 비우고 씀
cd web && npm test
cd web && node e2e/p1-smoke.mjs http://localhost:8080 <처음 비밀번호> <새 비밀번호>   # 깨끗한 DB 의 실행 중인 서버로
```
