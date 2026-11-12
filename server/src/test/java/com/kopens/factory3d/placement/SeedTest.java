package com.kopens.factory3d.placement;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.drawing.DrawingSeeder;
import com.kopens.factory3d.model.ModelSeeder;
import com.kopens.factory3d.support.IntegrationTest;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SeedTest extends IntegrationTest {
    @Autowired ModelSeeder modelSeeder;
    @Autowired PlacementSeeder placementSeeder;
    @Autowired DrawingSeeder drawingSeeder;

    @Test
    void 새_설치_모델11_나셀공장_배치79() throws Exception {
        drawingSeeder.seedAll();
        assertThat(jdbc.queryForObject("select count(*) from model", Integer.class)).isEqualTo(11);
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isEqualTo(79);
        assertThat(jdbc.queryForObject("select count(*) from placement where model_id is null", Integer.class)).isZero();
        assertThat(jdbc.queryForList("select name from placement", String.class)).contains("Main Station 1", "Hub 조립장");
        String glb = jdbc.queryForObject("select file from model where name = '허브'", String.class);
        assertThat(Files.size(dataDir.resolve(glb))).isGreaterThan(1000);
        drawingSeeder.seedAll(); // 다시 해도 그대로
        assertThat(jdbc.queryForObject("select count(*) from model", Integer.class)).isEqualTo(11);
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isEqualTo(79);
    }

    @Test
    void 기존_설치_나셀공장만_있으면_배치만_한번() throws Exception {
        drawingSeeder.seedIfEmpty(); // P2 상태: 도면만
        assertThat(jdbc.queryForObject("select count(*) from placement", Integer.class)).isZero();
        assertThat(modelSeeder.seedIfEmpty()).isEqualTo(11);
        assertThat(placementSeeder.seedFactory()).isEqualTo(79);
        assertThat(placementSeeder.seedFactory()).isZero();
    }

    @Test
    void 사용자가_만든_같은_이름_도면에는_넣지_않음() throws Exception {
        modelSeeder.seedIfEmpty();
        jdbc.update("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'kim')");
        assertThat(placementSeeder.seedFactory()).isZero();
    }
}
