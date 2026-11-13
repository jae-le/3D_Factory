package com.kopens.factory3d.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 로컬 PostgreSQL 테스트 DB(factory3d_test) 위에서 앱 전체를 띄우는 테스트의 바탕. Docker 안 씀.
 * 다른 DB 를 쓰려면 F3D_TEST_DB_URL / F3D_TEST_DB_USER / F3D_TEST_DB_PASSWORD.
 * 시작할 때 public 스키마를 지우고 다시 만듦 — 테스트 전용 DB 만 가리킬 것!
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTest {

    static final String URL = env("F3D_TEST_DB_URL", "jdbc:postgresql://localhost:5433/factory3d_test");
    static final String USER = env("F3D_TEST_DB_USER", "factory3d_test");
    static final String PASSWORD = env("F3D_TEST_DB_PASSWORD", "factory3d_test");
    protected static final Path dataDir;

    static {
        resetSchema();
        try {
            dataDir = Files.createTempDirectory("f3d-data-");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String env(String name, String fallback) {
        String v = System.getenv(name);
        return v == null || v.isBlank() ? fallback : v;
    }

    /** 이전 실행이 남긴 표·마이그레이션 이력을 지워 Flyway 가 처음부터 돌게 함 */
    private static void resetSchema() {
        String path = URL.contains("?") ? URL.substring(0, URL.indexOf('?')) : URL;
        if (!path.substring(path.lastIndexOf('/') + 1).endsWith("_test"))
            throw new IllegalStateException("테스트 DB 이름은 _test 로 끝나야 합니다: " + URL);
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD);
             Statement st = c.createStatement()) {
            st.execute("drop schema public cascade");
            st.execute("create schema public");
        } catch (SQLException e) {
            throw new IllegalStateException("테스트 DB(" + URL + ")를 비우지 못함 — scripts/setup-db.sql 을 실행했는지 확인", e);
        }
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", () -> URL);
        r.add("spring.datasource.username", () -> USER);
        r.add("spring.datasource.password", () -> PASSWORD);
        r.add("factory3d.data-dir", dataDir::toString);
        r.add("factory3d.live.enabled", () -> "false"); // 1초 진행은 테스트가 advance 로 직접
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabaseAndFiles() throws IOException {
        List<String> tables = jdbc.queryForList(
                "select tablename from pg_tables where schemaname = 'public' and tablename <> 'flyway_schema_history'",
                String.class);
        if (!tables.isEmpty()) jdbc.execute("truncate " + String.join(", ", tables) + " cascade");
        try (Stream<Path> files = Files.walk(dataDir)) {
            files.sorted(Comparator.reverseOrder()).filter(p -> !p.equals(dataDir)).forEach(p -> p.toFile().delete());
        }
    }
}
