package com.kopens.factory3d.devdb;

import com.kopens.factory3d.common.DataDir;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 빈 DB 로 처음 시작할 때 저장소의 스냅샷(db-snapshot/)을 넣는다 — Flyway 로 표를 만든 직후, 기본 데이터 넣기(관리자·기본 도면 등) 전에.
 * 사용자가 한 명이라도 있으면 아무것도 하지 않는다. 프로필 embedded 에서 켜짐 (factory3d.snapshot.import-on-empty).
 */
@Configuration
@ConditionalOnProperty(name = "factory3d.snapshot.import-on-empty", havingValue = "true")
public class SnapshotImport {
    private static final Pattern TABLE = Pattern.compile("insert into \"([a-z0-9_]+)\" ");
    private static final Logger log = LoggerFactory.getLogger(SnapshotImport.class);

    @Bean
    public FlywayMigrationStrategy snapshotImportStrategy(DataSource dataSource, DataDir dataDir,
                                                          @Value("${factory3d.snapshot.dir}") String dir) {
        return flyway -> {
            flyway.migrate();
            importIfEmpty(dataSource, dataDir, Path.of(dir).toAbsolutePath().normalize());
        };
    }

    private static void importIfEmpty(DataSource dataSource, DataDir dataDir, Path dir) {
        Path sql = dir.resolve(Snapshot.SQL_FILE);
        if (!Files.isRegularFile(sql)) {
            log.info("스냅샷 없음 ({}) — 기본 데이터로 시작합니다", sql);
            return;
        }
        try (Connection c = dataSource.getConnection()) {
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("select count(*) from app_user")) {
                rs.next();
                if (rs.getLong(1) > 0) return;
            }
            c.setAutoCommit(false);
            List<String> lines = Files.readAllLines(sql, StandardCharsets.UTF_8).stream()
                    .filter(l -> !l.isBlank() && !l.startsWith("--")).toList();
            // 스냅샷에 든 표는 마이그레이션이 넣은 기본 행(예: ai_setting)을 지우고 스냅샷으로 채움
            Set<String> tables = new LinkedHashSet<>();
            for (String l : lines) {
                Matcher m = TABLE.matcher(l);
                if (m.lookingAt()) tables.add(m.group(1));
            }
            int rows = 0;
            try (Statement st = c.createStatement()) {
                st.execute("set local session_replication_role = replica"); // 외래 키 순서 무시 (넣는 동안만)
                for (String t : tables) st.execute("delete from \"" + t + "\"");
                for (String l : lines) {
                    st.addBatch(l);
                    if (++rows % 500 == 0) st.executeBatch();
                }
                st.executeBatch();
                resetSequences(c);
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
            int files = Snapshot.copyTree(dir.resolve(Snapshot.FILES_DIR), dataDir.root(), false);
            log.info("스냅샷을 넣었습니다 — 행 {}개 · 파일 {}개 ({})", rows, files, dir);
        } catch (SQLException | IOException e) {
            throw new IllegalStateException("스냅샷을 넣지 못했습니다: " + sql, e);
        }
    }

    /** 일련번호를 각 표의 최댓값 다음으로 */
    private static void resetSequences(Connection c) throws SQLException {
        List<String> stmts = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("""
                select format('select setval(%L, coalesce((select max(%I) from %I), 0) + 1, false)', s, column_name, table_name)
                from (select table_name, column_name, pg_get_serial_sequence(quote_ident(table_name), column_name) s
                      from information_schema.columns
                      where table_schema = 'public' and (column_default like 'nextval(%' or is_identity = 'YES')) x
                where s is not null""")) {
            while (rs.next()) stmts.add(rs.getString(1));
        }
        try (Statement st = c.createStatement()) {
            for (String s : stmts) st.execute(s);
        }
    }
}
