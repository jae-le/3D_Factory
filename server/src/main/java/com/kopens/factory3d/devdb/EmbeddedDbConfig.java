package com.kopens.factory3d.devdb;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * 프로필 embedded: PostgreSQL 17 을 앱 안에서 띄운다 (DB 설치 불필요).
 * 데이터는 factory3d.embedded-db.dir 폴더에 남아 다시 켜도 그대로. DB 를 처음부터 다시 받으려면 그 폴더를 지운다.
 */
@Configuration
@Profile("embedded")
public class EmbeddedDbConfig {
    private static final Logger log = LoggerFactory.getLogger(EmbeddedDbConfig.class);
    private static final String DB = "factory3d";

    @Bean(destroyMethod = "close")
    public EmbeddedPostgres embeddedPostgres(@Value("${factory3d.embedded-db.dir}") String dir,
                                             @Value("${factory3d.embedded-db.port}") int port) throws IOException {
        Path dataDir = Path.of(dir).toAbsolutePath().normalize();
        Files.createDirectories(dataDir);
        log.info("내장 PostgreSQL 시작 — 폴더 {} · 포트 {}", dataDir, port);
        return EmbeddedPostgres.builder()
                .setDataDirectory(dataDir)
                .setCleanDataDirectory(false)
                .setPort(port)
                .start();
    }

    @Bean(destroyMethod = "close")
    public DataSource dataSource(EmbeddedPostgres pg) throws SQLException {
        try (Connection c = pg.getPostgresDatabase().getConnection(); Statement st = c.createStatement()) {
            boolean exists;
            try (ResultSet rs = st.executeQuery("select 1 from pg_database where datname = '" + DB + "'")) {
                exists = rs.next();
            }
            if (!exists) {
                st.execute("create database " + DB + " encoding 'UTF8' template template0");
                log.info("내장 DB '{}' 를 새로 만들었습니다", DB);
            }
        }
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(pg.getJdbcUrl("postgres", DB));
        cfg.setUsername("postgres");
        cfg.setPoolName("embedded");
        cfg.setMaximumPoolSize(10);
        return new HikariDataSource(cfg);
    }
}
