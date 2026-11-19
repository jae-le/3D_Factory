package com.kopens.factory3d.devdb;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.Set;
import java.util.stream.Stream;

/**
 * 개발용 DB 스냅샷 (저장소의 db-snapshot/) — data.sql 한 줄 = 한 문장
 * ({@code insert into "표" select * from jsonb_populate_record(null::"표", '<행 json>');}) 와 files/ (업로드 파일).
 */
final class Snapshot {
    static final String SQL_FILE = "data.sql";
    static final String FILES_DIR = "files";
    /** 담지 않는 표: 스키마 이력(Flyway 가 만듦) · 로그인 세션 · 로그인 기록(IP) */
    static final Set<String> SKIP_TABLES = Set.of("flyway_schema_history", "spring_session", "spring_session_attributes",
            "login_history");

    private Snapshot() {}

    /** from 아래 파일을 to 로 복사. overwrite=false 면 이미 있는 파일은 둠 */
    static int copyTree(Path from, Path to, boolean overwrite) throws IOException {
        if (!Files.isDirectory(from)) return 0;
        int n = 0;
        try (Stream<Path> walk = Files.walk(from)) {
            for (Path src : (Iterable<Path>) walk::iterator) {
                Path dst = to.resolve(from.relativize(src).toString());
                if (Files.isDirectory(src)) {
                    Files.createDirectories(dst);
                } else if (overwrite || !Files.exists(dst)) {
                    Files.createDirectories(dst.getParent());
                    Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
                    n++;
                }
            }
        }
        return n;
    }

    static void deleteTree(Path dir) throws IOException {
        if (!Files.exists(dir)) return;
        try (Stream<Path> walk = Files.walk(dir)) {
            for (Path p : (Iterable<Path>) walk.sorted(Comparator.reverseOrder())::iterator) Files.delete(p);
        }
    }
}
