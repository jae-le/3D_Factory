package com.kopens.factory3d.station;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.drawing.DrawingSeeder;
import com.kopens.factory3d.support.IntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class StationSeedTest extends IntegrationTest {
    @Autowired DrawingSeeder drawingSeeder;
    @Autowired StationSeeder stationSeeder;

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    @Test
    void 새_설치_나셀공장에_공정6_PJT4() throws Exception {
        drawingSeeder.seedAll();
        assertThat(jdbc.queryForList("select name from station order by sort_order", String.class))
                .containsExactly("Hub 조립장", "Main Station 3", "Main Station 2", "Main Station 1", "Sub_Main Frame 조립장", "Sub_Yaw Bearing");
        assertThat(jdbc.queryForList("select name || ' ' || done || '/' || total || ' ' || state from project order by sort_order", String.class))
                .containsExactly("야월해상 3/13 run", "서남해상 7/13 run", "신안해상 2/13 run", "다대포 0/8 wait");
        Map<String, Object> main2 = jdbc.queryForMap("select s.placement_name, s.counts_project, p.name as pjt, cardinality(s.steps) as n, "
                + "s.steps[1] as first, s.takt_sec from station s join project p on p.id = s.project_id where s.name = 'Main Station 2'");
        assertThat(main2.get("placement_name")).isEqualTo("Main Station 2");
        assertThat(main2.get("counts_project")).isEqualTo(true);
        assertThat(main2.get("pjt")).isEqualTo("서남해상");
        assertThat(main2.get("n")).isEqualTo(12);
        assertThat(main2.get("first")).isEqualTo("Bed Frame 세팅");
        assertThat(main2.get("takt_sec")).isEqualTo(1200);
        // 모든 공정의 연결 설비가 기본 배치에 있음 (칩이 빠지지 않음)
        assertThat(jdbc.queryForObject("select count(*) from station s where not exists (select 1 from placement p "
                + "where p.drawing_id = s.drawing_id and p.name = s.placement_name)", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'STATION_SEED'", Integer.class)).isEqualTo(1);
        drawingSeeder.seedAll(); // 다시 해도 그대로
        assertThat(count("station")).isEqualTo(6);
        assertThat(count("project")).isEqualTo(4);
    }

    @Test
    void 기존_설치는_한_번만_넣고_지워도_다시_넣지_않음() throws Exception {
        drawingSeeder.seedIfEmpty(); // P3 까지의 상태: 나셀 공장 도면은 있고 공정은 없음
        assertThat(count("station")).isZero();
        assertThat(stationSeeder.seedFactory()).isEqualTo(6);
        assertThat(stationSeeder.seedFactory()).isZero();
        jdbc.update("delete from station");
        jdbc.update("delete from project");
        assertThat(stationSeeder.seedFactory()).isZero(); // 감사 기록 STATION_SEED 가 있으므로
    }

    @Test
    void 사용자가_만든_같은_이름_도면에는_넣지_않음() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'kim')");
        assertThat(stationSeeder.seedFactory()).isZero();
        assertThat(count("station")).isZero();
    }

    @Test
    void 시작_실적_목표는_나셀_공장만() throws Exception {
        long factory = jdbc.queryForObject("insert into drawing (name, source_type, source_file, created_by) values ('나셀 공장', 'dxf', 'x', 'system') returning id", Long.class);
        long mine = jdbc.queryForObject("insert into drawing (name, source_type, source_file, created_by) values ('2공장', 'dxf', 'x', 'kim') returning id", Long.class);
        assertThat(stationSeeder.startValues(factory).get("Main Station 2")).containsExactly(60.0, 88.0);
        assertThat(stationSeeder.startValues(factory)).hasSize(6);
        assertThat(stationSeeder.startValues(mine)).isEmpty();
    }
}
