package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.kopens.factory3d.ai.ClaudeGateway.ToolCall;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class SceneToolsTest extends AiTestBase {
    @Autowired SceneTools tools;
    final Changeset cs = new Changeset();
    int n;

    SceneTools.Result run(String name, String input) {
        return tools.execute(drawing, cs, new ToolCall("t" + (++n), name, input));
    }

    @Test
    void 도구_목록은_9개_strict_스키마() {
        assertThat(tools.specs()).extracting(ClaudeGateway.ToolSpec::name).containsExactly("get_scene", "move_object", "rotate_object",
                "add_object", "delete_object", "rename_object", "set_station", "edit_partition", "rename_zone");
        assertThat(tools.specs()).allSatisfy(s -> assertThat(s.inputSchemaJson()).contains("\"additionalProperties\":false"));
    }

    @Test
    void 장면_읽기() {
        SceneTools.Result r = run("get_scene", "{}");
        assertThat(r.isError()).isFalse();
        assertThat(r.label()).isEqualTo("장면 확인 중…");
        assertThat(r.content()).contains("\"name\":\"나셀 공장\"", "\"widthM\":40.0", "Main Station 1", "\"model\":\"Main Station\"",
                "조립 구역", "\"id\":\"p1\"", "\"taktMin\":20.0", "\"steps\":2", "\"projectId\":null", "\"id\":" + ms1 + ",\"name\":\"Main Station 1\"", "\"aliases\":[\"MS\"]", "\"pendingChanges\":0");
    }

    @Test
    void 이동_제안은_겹쳐_계산하고_원래대로면_지움() {
        SceneTools.Result a = run("move_object", "{\"name\":\"Main Station 1\",\"dx\":2}");
        assertThat(a.isError()).isFalse();
        assertThat(a.content()).contains("제안 #1 기록됨 (아직 적용 안 됨)");
        assertThat(a.label()).isEqualTo("Main Station 1 이동 제안");
        Changeset.Item it = cs.items().get(0);
        assertThat(it.kind()).isEqualTo("placement.move");
        assertThat(it.targetKey()).isEqualTo("placement:" + ms1);
        assertThat(it.before().path("x").asDouble()).isEqualTo(10);
        assertThat(it.after().path("x").asDouble()).isEqualTo(12);
        assertThat(it.label()).isEqualTo("Main Station 1 이동 (10.0, 5.0) → (12.0, 5.0)");

        run("move_object", "{\"name\":\"main station 1\",\"dx\":2}"); // 이름은 대소문자·공백 무시
        assertThat(cs.items()).hasSize(1);
        assertThat(cs.items().get(0).seq()).isEqualTo(1);
        assertThat(cs.items().get(0).after().path("x").asDouble()).isEqualTo(14);

        run("rotate_object", "{\"name\":\"Main Station 1\",\"rot\":450}");
        assertThat(cs.items().get(0).kind()).isEqualTo("placement.update");
        assertThat(cs.items().get(0).after().path("rot").asDouble()).isEqualTo(90);

        run("move_object", "{\"name\":\"Main Station 1\",\"x\":10,\"y\":5}");
        run("rotate_object", "{\"name\":\"Main Station 1\",\"rot\":0}");
        assertThat(cs.isEmpty()).isTrue();
        assertThat(placementX(ms1)).isEqualTo(10); // DB 는 그대로
    }

    @Test
    void 잘못된_입력은_오류_결과() {
        assertThat(run("move_object", "{\"name\":\"없는 설비\",\"dx\":1}").content()).contains("'없는 설비' 이름의 객체가 없습니다");
        SceneTools.Result out = run("move_object", "{\"name\":\"Main Station 1\",\"x\":50,\"y\":5}");
        assertThat(out.isError()).isTrue();
        assertThat(out.content()).contains("도면 밖입니다 (x 0~40, y 0~20 m)");
        assertThat(out.label()).startsWith("확인 필요: ");
        assertThat(run("move_object", "{\"name\":\"Main Station 1\"}").content()).contains("x·y 또는 dx·dy 를 주세요");
        assertThat(run("rename_object", "{\"name\":\"Main Station 1\",\"newName\":\"Main Station 2\"}").content())
                .contains("같은 이름의 객체가 이미 있습니다");
        assertThat(run("add_object", "{\"model\":\"로봇팔\",\"x\":1,\"y\":1}").content()).contains("'로봇팔' 모델이 없습니다", "Main Station");
        assertThat(run("nope", "{}").isError()).isTrue();
        assertThat(cs.isEmpty()).isTrue();
    }

    @Test
    void 추가한_객체를_옮기면_추가_항목이_바뀌고_지우면_사라짐() {
        SceneTools.Result a = run("add_object", "{\"model\":\"ms\",\"x\":30,\"y\":10}"); // 별칭
        assertThat(a.isError()).isFalse();
        Changeset.Item add = cs.items().get(0);
        assertThat(add.kind()).isEqualTo("placement.add");
        assertThat(add.target()).isEqualTo("Main Station 3");
        assertThat(add.targetKey()).isEqualTo("new:1");
        assertThat(add.after().path("modelId").asLong()).isEqualTo(model);
        assertThat(add.before()).isNull();

        run("move_object", "{\"name\":\"Main Station 3\",\"dy\":-2}");
        assertThat(cs.items()).hasSize(1);
        assertThat(cs.items().get(0).after().path("y").asDouble()).isEqualTo(8);
        assertThat(cs.items().get(0).label()).isEqualTo("Main Station 3 추가 (30.0, 8.0)");

        run("delete_object", "{\"name\":\"Main Station 3\"}");
        assertThat(cs.isEmpty()).isTrue();
    }

    @Test
    void 삭제_이름변경_공정_가벽_구역() {
        run("delete_object", "{\"name\":\"Main Station 2\"}");
        run("rename_object", "{\"name\":\"Main Station 1\",\"newName\":\"MS-1\"}");
        run("set_station", "{\"name\":\"조립\",\"taktMin\":25,\"warnPp\":12}");
        run("edit_partition", "{\"op\":\"add\",\"a\":[2,10],\"b\":[8,10]}");
        run("edit_partition", "{\"op\":\"delete\",\"id\":\"p1\"}");
        run("rename_zone", "{\"id\":\"z1\",\"name\":\"허브 구역\"}");
        assertThat(cs.items()).extracting(Changeset.Item::kind).containsExactly("placement.delete", "placement.rename", "station.update",
                "plan.partition.add", "plan.partition.delete", "plan.zone.rename");
        assertThat(cs.items()).extracting(Changeset.Item::label).containsExactly(
                "Main Station 2 삭제",
                "Main Station 1 이름 → MS-1",
                "공정 조립: 택타임 20분 → 25분 · 주의 10% → 12%",
                "가벽 추가 (2.0, 10.0) → (8.0, 10.0)",
                "가벽 p1 삭제",
                "구역 조립 구역 → 허브 구역");
        assertThat(cs.items().get(0).after()).isNull();
        assertThat(cs.items().get(2).after().path("taktSec").asInt()).isEqualTo(1500);
        assertThat(cs.items().get(3).targetKey()).isEqualTo("partition:p2");
        assertThat(cs.items().get(3).after().toString()).isEqualTo("{\"id\":\"p2\",\"pts\":[[2.0,10.0],[8.0,10.0]],\"h\":1.2,\"t\":0.5}");
        assertThat(run("set_station", "{\"name\":\"조립\",\"warnPp\":30,\"delayPp\":20}").content())
                .contains("0 ≤ 주의 < 지연 ≤ 100");
        assertThat(run("get_scene", "{}").content()).contains("MS-1", "\"pendingChanges\":6").doesNotContain("\"name\":\"Main Station 2\"");
        assertThat(jdbc.queryForObject("select plan->'zones'->0->>'name' from drawing where id = ?", String.class, drawing)).isEqualTo("조립 구역");
        assertThat(jdbc.queryForObject("select count(*) from placement where drawing_id = ?", Integer.class, drawing)).isEqualTo(2);
    }

    @Test
    void 되돌리기_스냅샷() {
        run("move_object", "{\"name\":\"Main Station 1\",\"dx\":1}");
        Changeset.Snapshot s = cs.snapshot();
        int v = cs.version();
        run("move_object", "{\"name\":\"Main Station 2\",\"dx\":1}");
        cs.restore(s);
        assertThat(cs.items()).hasSize(1);
        assertThat(cs.version()).isGreaterThan(v);
        assertThat(cs.nextSeq()).isEqualTo(2);
    }
}
