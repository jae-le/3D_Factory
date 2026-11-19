package com.kopens.factory3d.devdb;

import com.kopens.factory3d.common.DataDir;
import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 지금 DB + 업로드 파일을 저장소의 스냅샷(db-snapshot/)으로 내보내고 끝낸다 (factory3d.snapshot.export=true, scripts/snapshot-export).
 * 공개 저장소에 올라가므로 비밀은 빼고 넣는다: 모든 계정 비밀번호 → factory3d.snapshot.user-password (첫 로그인 때 변경),
 * 암호화된 AI API 키 제거, 감사 기록의 IP·키 끝자리 제거, 세션·로그인 기록 표 제외.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(name = "factory3d.snapshot.export", havingValue = "true")
public class SnapshotExport implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SnapshotExport.class);
    private final DataSource dataSource;
    private final DataDir dataDir;
    private final PasswordEncoder encoder;
    private final ConfigurableApplicationContext context;
    private final Path dir;
    private final String userPassword;

    public SnapshotExport(DataSource dataSource, DataDir dataDir, PasswordEncoder encoder, ConfigurableApplicationContext context,
                          @Value("${factory3d.snapshot.dir}") String dir,
                          @Value("${factory3d.snapshot.user-password}") String userPassword) {
        this.dataSource = dataSource;
        this.dataDir = dataDir;
        this.encoder = encoder;
        this.context = context;
        this.dir = Path.of(dir).toAbsolutePath().normalize();
        this.userPassword = userPassword;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        int code = 0;
        try {
            export();
        } catch (Exception e) {
            log.error("스냅샷 내보내기 실패", e);
            code = 1;
        }
        int exit = code;
        System.exit(SpringApplication.exit(context, () -> exit));
    }

    void export() throws Exception {
        Files.createDirectories(dir);
        String hash = encoder.encode(userPassword);
        // 표별로 행 json 을 바꿔 비밀을 뺌
        Map<String, String> patch = Map.of(
                "app_user", "jsonb_build_object('password_hash', ?::text, 'must_change_password', true, 'failed_count', 0, "
                        + "'locked_until', null, 'last_login_at', null)",
                "ai_setting", "jsonb_build_object('api_key_enc', null, 'key_hint', null, 'enabled', false)",
                "audit_log", "jsonb_build_object('ip', null) || case when t.action like 'AI_KEY%' "
                        + "then jsonb_build_object('target', null) else '{}'::jsonb end");
        int rows = 0;
        Path tmp = dir.resolve(Snapshot.SQL_FILE + ".tmp");
        try (Connection c = dataSource.getConnection();
             BufferedWriter out = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
            out.write("-- Factory3D 개발용 DB 스냅샷 — scripts/snapshot-export 로 만듦. 빈 DB 로 처음 켤 때(프로필 embedded) 들어감\n");
            for (String[] t : tables(c)) {
                String table = t[0], firstColumn = t[1];
                String row = patch.containsKey(table) ? "(to_jsonb(t) || " + patch.get(table) + ")" : "to_jsonb(t)";
                String q = "select " + row + "::text from " + ident(table) + " t order by t." + ident(firstColumn);
                try (PreparedStatement ps = c.prepareStatement(q)) {
                    if (table.equals("app_user")) ps.setString(1, hash);
                    try (ResultSet rs = ps.executeQuery()) {
                        while (rs.next()) {
                            out.write("insert into " + ident(table) + " select * from jsonb_populate_record(null::" + ident(table)
                                    + ", '" + rs.getString(1).replace("'", "''") + "');\n");
                            rows++;
                        }
                    }
                }
            }
        }
        Files.move(tmp, dir.resolve(Snapshot.SQL_FILE), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        Path files = dir.resolve(Snapshot.FILES_DIR);
        Snapshot.deleteTree(files);
        int n = Snapshot.copyTree(dataDir.root(), files, true);
        log.info("스냅샷을 내보냈습니다 — 행 {}개 · 파일 {}개 → {}", rows, n, dir);
    }

    /** public 표 이름과 첫 열 (정렬용) */
    private static List<String[]> tables(Connection c) throws Exception {
        List<String[]> list = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("""
                select t.table_name, (select column_name from information_schema.columns k
                                      where k.table_schema = 'public' and k.table_name = t.table_name and k.ordinal_position = 1)
                from information_schema.tables t
                where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
                order by t.table_name""")) {
            while (rs.next()) if (!Snapshot.SKIP_TABLES.contains(rs.getString(1))) list.add(new String[] {rs.getString(1), rs.getString(2)});
        }
        return list;
    }

    private static String ident(String name) {
        return "\"" + name.replace("\"", "\"\"") + "\"";
    }
}
