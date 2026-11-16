package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class ApplyRevertApiTest extends AiTestBase {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor KIM = user("kim").roles("OPERATOR");
    static final RequestPostProcessor LEE = user("lee").roles("OPERATOR");
    static final RequestPostProcessor ADMIN = user("admin").roles("ADMIN");

    @Autowired ChatService chat;

    @BeforeEach
    void on() {
        enableAi();
    }

    /** who 의 대화에서 요청들을 보내고 마지막 제안 묶음 id */
    String propose(String who, String... messages) {
        List<Changeset.View> got = new ArrayList<>();
        for (String m : messages)
            chat.chat(who, drawing, m, new ChatSink() {
                public void text(String c) {}

                public void tool(String n, String l) {}

                public void proposal(Changeset.View p) {
                    got.add(p);
                }

                public void done(ChatService.Done d) {}

                public void error(String e) {
                    throw new AssertionError(e);
                }
            });
        return got.getLast().id();
    }

    ResultActions apply(String batch, RequestPostProcessor who) throws Exception {
        return mvc.perform(post("/api/ai/changes/" + batch + "/apply").with(who).with(csrf()));
    }

    ResultActions revert(String batch, RequestPostProcessor who) throws Exception {
        return mvc.perform(post("/api/changes/" + batch + "/revert").with(who).with(csrf()));
    }

    @Test
    void 적용하면_한_트랜잭션으로_저장하고_AI_이력() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘", "Main Station 을 (30, 12)에 추가해줘", "Main Station 2 를 지워줘",
                "가벽 (2, 10)-(8, 10) 추가해줘");
        apply(b, KIM).andExpect(status().isOk())
                .andExpect(jsonPath("$.batchId").value(b))
                .andExpect(jsonPath("$.applied").value(4))
                .andExpect(jsonPath("$.skipped.length()").value(0));
        assertThat(placementX(ms1)).isEqualTo(12);
        assertThat(jdbc.queryForObject("select count(*) from placement where id = ?", Integer.class, ms2)).isZero();
        assertThat(jdbc.queryForObject("select x from placement where name = 'Main Station 3'", Double.class)).isEqualTo(30);
        assertThat(jdbc.queryForObject("select jsonb_array_length(plan->'partitions') from drawing where id = ?", Integer.class, drawing)).isEqualTo(2);
        assertThat(jdbc.queryForList("select kind from change_log where source = 'AI' and batch_id = cast(? as uuid) order by id", String.class, b))
                .containsExactly("placement.move", "placement.add", "placement.delete", "plan.partition.add");
        assertThat(jdbc.queryForObject("select target_key from change_log where kind = 'placement.add'", String.class)).startsWith("placement:");
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'AI_APPLY' and username = 'kim'", Integer.class)).isEqualTo(1);
        apply(b, KIM).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("제안을 찾을 수 없습니다. (이미 적용·취소했거나 대화가 비워졌습니다)"));
    }

    @Test
    void 남의_묶음은_적용_못함_조회_권한도_못함() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        apply(b, LEE).andExpect(status().isNotFound());
        apply(b, VIEWER).andExpect(status().isForbidden());
        assertThat(placementX(ms1)).isEqualTo(10);
    }

    @Test
    void 공정_항목은_운전원이면_건너뜀_관리자면_적용() throws Exception {
        String b = propose("kim", "공정 조립 택타임 25분으로", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        apply(b, KIM).andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(1))
                .andExpect(jsonPath("$.skipped[0].seq").value(1))
                .andExpect(jsonPath("$.skipped[0].reason").value("공정 기준정보는 관리자만 바꿀 수 있습니다"));
        assertThat(jdbc.queryForObject("select takt_sec from station where id = ?", Integer.class, station)).isEqualTo(1200);

        String a = propose("admin", "공정 조립 택타임 25분으로");
        apply(a, ADMIN).andExpect(jsonPath("$.applied").value(1));
        assertThat(jdbc.queryForObject("select takt_sec from station where id = ?", Integer.class, station)).isEqualTo(1500);
    }

    @Test
    void 제안_뒤에_바뀐_객체는_건너뜀() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        mvc.perform(patch("/api/placements/" + ms1).contentType(MediaType.APPLICATION_JSON).content("{\"y\":7}").with(LEE).with(csrf()))
                .andExpect(status().isOk());
        apply(b, KIM).andExpect(jsonPath("$.applied").value(0))
                .andExpect(jsonPath("$.skipped[0].reason").value("제안 뒤에 다른 곳에서 바뀌었습니다"));
        assertThat(placementX(ms1)).isEqualTo(10);
    }

    @Test
    void 취소하면_묶음이_사라짐() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        mvc.perform(post("/api/ai/changes/" + b + "/discard").with(KIM).with(csrf())).andExpect(status().isNoContent());
        apply(b, KIM).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from change_log", Integer.class)).isZero();
    }

    @Test
    void 되돌리기는_묶음을_통째로_역적용() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘", "Main Station 을 (30, 12)에 추가해줘", "Main Station 2 를 지워줘",
                "가벽 (2, 10)-(8, 10) 추가해줘");
        apply(b, KIM).andExpect(status().isOk());
        revert(b, LEE).andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("자기가 한 변경만 되돌릴 수 있습니다."));
        revert(b, KIM).andExpect(status().isOk()).andExpect(jsonPath("$.reverted").value(4));
        assertThat(placementX(ms1)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from placement where name = 'Main Station 2'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from placement where name = 'Main Station 3'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select jsonb_array_length(plan->'partitions') from drawing where id = ?", Integer.class, drawing)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select bool_and(reverted) from change_log where batch_id = cast(? as uuid)", Boolean.class, b)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'CHANGE_REVERT'", Integer.class)).isEqualTo(1);
        revert(b, KIM).andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("이미 되돌린 묶음입니다."));
    }

    @Test
    void 뒤에_같은_대상을_바꿨으면_409_그_뒤것을_먼저_되돌리면_됨() throws Exception {
        String b = propose("kim", "Main Station 1 을 오른쪽으로 2m 옮겨줘");
        apply(b, KIM).andExpect(status().isOk());
        mvc.perform(patch("/api/placements/" + ms1).contentType(MediaType.APPLICATION_JSON).content("{\"y\":7}").with(KIM).with(csrf()))
                .andExpect(status().isOk());
        revert(b, KIM).andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("이후에 바뀐 객체가 있어 되돌릴 수 없습니다"));
        String userBatch = jdbc.queryForObject("select batch_id::text from change_log where source = 'USER' order by id desc limit 1", String.class);
        revert(userBatch, KIM).andExpect(status().isOk()); // 사람 편집도 묶음 되돌리기
        revert(b, ADMIN).andExpect(status().isOk());
        assertThat(placementX(ms1)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select y from placement where id = ?", Double.class, ms1)).isEqualTo(5);
    }

    @Test
    void 공정_묶음_되돌리기는_관리자만() throws Exception {
        String a = propose("admin", "공정 조립 택타임 25분으로");
        apply(a, ADMIN).andExpect(status().isOk());
        jdbc.update("update change_log set username = 'kim' where batch_id = cast(? as uuid)", a); // 운전원 묶음인 척
        revert(a, KIM).andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("공정 기준정보 변경은 관리자만 되돌릴 수 있습니다."));
        revert(a, ADMIN).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select takt_sec from station where id = ?", Integer.class, station)).isEqualTo(1200);
        revert("not-a-uuid", ADMIN).andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("변경 묶음을 찾을 수 없습니다."));
    }

    @Test
    void 비표준_uuid_는_404() throws Exception {
        revert("1-1-1-1-1", ADMIN).andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("변경 묶음을 찾을 수 없습니다."));
    }
}
