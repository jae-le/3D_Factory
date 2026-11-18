package com.kopens.factory3d.ai;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * AI 테스트 공통 장면 (가짜 게이트웨이): 도면 40×20m · 가벽 p1 · 구역 z1 '조립 구역' · 모델 'Main Station'(별칭 MS, 4×3×2.5) ·
 * 배치 'Main Station 1'(10,5) 'Main Station 2'(20,5) · 공정 '조립'(Main Station 1, 택타임 1200초)
 */
abstract class AiTestBase extends IntegrationTest {
    static final String PLAN = "{\"format\":1,\"bounds\":{\"w\":40,\"h\":20},\"lines\":[],"
            + "\"texts\":[{\"str\":\"Station (미표기)\",\"x\":3,\"y\":3,\"h\":0.8,\"layer\":\"STATION\"},{\"str\":\"출하\",\"x\":30,\"y\":3,\"h\":0.8,\"layer\":\"ZONE\"}],"
            + "\"partitions\":[{\"id\":\"p1\",\"pts\":[[1,1],[5,1]],\"h\":1.2,\"t\":0.5}],"
            + "\"zones\":[{\"id\":\"z1\",\"name\":\"조립 구역\",\"poly\":[[0,0],[10,0],[10,5],[0,5]],\"color\":\"#88aaff\",\"stationId\":null}]}";

    @Autowired AiSettingService settings;
    long drawing;
    long model;
    long ms1;
    long ms2;
    long station;

    @BeforeEach
    void scene() {
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file, plan) values ('나셀 공장', 'dxf', 'x', cast(? as jsonb)) returning id",
                Long.class, PLAN);
        model = jdbc.queryForObject("insert into model (name, category, source_ext, size_x, size_y, size_z, aliases) "
                + "values ('Main Station', 'equip', 'glb', 4, 3, 2.5, '{MS}') returning id", Long.class);
        ms1 = jdbc.queryForObject("insert into placement (drawing_id, model_id, name, x, y, rot) values (?, ?, 'Main Station 1', 10, 5, 0) returning id",
                Long.class, drawing, model);
        ms2 = jdbc.queryForObject("insert into placement (drawing_id, model_id, name, x, y, rot) values (?, ?, 'Main Station 2', 20, 5, 0) returning id",
                Long.class, drawing, model);
        station = jdbc.queryForObject("insert into station (drawing_id, sort_order, name, placement_name, steps) "
                + "values (?, 1, '조립', 'Main Station 1', '{a,b}') returning id", Long.class, drawing);
    }

    /** 키 등록 + 사용 (가짜 게이트웨이라 키 값은 쓰이지 않음) */
    void enableAi() {
        settings.setKey("sk-ant-api03-test-key-00000000abcd", "admin");
        settings.update(new AiSettingService.Update(null, null, true, null), "admin");
    }

    double placementX(long id) {
        return jdbc.queryForObject("select x from placement where id = ?", Double.class, id);
    }
}
