package com.kopens.factory3d.drawing;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.support.IntegrationTest;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class DrawingSeederTest extends IntegrationTest {
    @Autowired DrawingSeeder seeder;

    @Test
    void 도면이_없을_때만_나셀_공장을_넣음() throws Exception {
        assertThat(seeder.seedIfEmpty()).isTrue();
        assertThat(seeder.seedIfEmpty()).isFalse();
        var rows = jdbc.queryForList("select id, name, created_by, source_file, (plan -> 'bounds' ->> 'w')::float8 as w from drawing");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("name")).isEqualTo("나셀 공장");
        assertThat(rows.get(0).get("created_by")).isEqualTo("system");
        assertThat((Double) rows.get(0).get("w")).isGreaterThan(150);
        assertThat(Files.size(dataDir.resolve((String) rows.get(0).get("source_file")))).isGreaterThan(10_000);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'DRAWING_SEED'", Integer.class)).isEqualTo(1);
    }
}
