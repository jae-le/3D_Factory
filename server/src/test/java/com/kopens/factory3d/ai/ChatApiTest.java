package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class ChatApiTest extends AiTestBase {
    static final RequestPostProcessor VIEWER = user("viewer").roles("VIEWER");
    static final RequestPostProcessor OPERATOR = user("kim").roles("OPERATOR");
    static final String MOVE = "Main Station 1 을 오른쪽으로 2m 옮겨줘";

    @Autowired ChatService chat;
    @Autowired ProposalStore store;

    static class Rec implements ChatSink {
        final List<String> events = new ArrayList<>();
        final StringBuilder text = new StringBuilder();
        final List<String> tools = new ArrayList<>();
        Changeset.View proposal;
        ChatService.Done done;
        String error;

        public void text(String chunk) {
            events.add("text");
            text.append(chunk);
        }

        public void tool(String name, String label) {
            events.add("tool:" + name);
            tools.add(label);
        }

        public void proposal(Changeset.View p) {
            events.add("proposal");
            proposal = p;
        }

        public void done(ChatService.Done d) {
            events.add("done");
            done = d;
        }

        public void error(String message) {
            events.add("error");
            error = message;
        }
    }

    Rec ask(String message) {
        Rec r = new Rec();
        chat.chat("kim", drawing, message, r);
        return r;
    }

    /** 첫 도구 이벤트 뒤에 떠나는(또는 대화를 초기화하는) 받는 쪽 */
    final class Leaving extends Rec {
        boolean closed;
        final Runnable onFirstTool;

        Leaving(Runnable onFirstTool) {
            this.onFirstTool = onFirstTool;
        }

        @Override
        public void tool(String name, String label) {
            super.tool(name, label);
            if (tools.size() == 1) onFirstTool.run();
        }

        @Override
        public boolean closed() {
            return closed;
        }
    }

    @Test
    void 받는_쪽이_떠나면_Claude_호출을_멈춤() {
        enableAi();
        Leaving[] l = new Leaving[1];
        l[0] = new Leaving(() -> l[0].closed = true);
        chat.chat("kim", drawing, MOVE, l[0]);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage where purpose = 'chat'", Integer.class)).isEqualTo(1);
        assertThat(l[0].events).doesNotContain("done", "error", "proposal");
    }

    @Test
    void 대화가_초기화되면_Claude_호출을_멈춤() {
        enableAi();
        Leaving l = new Leaving(() -> store.reset("kim", drawing));
        chat.chat("kim", drawing, MOVE, l);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage where purpose = 'chat'", Integer.class)).isEqualTo(1);
        assertThat(l.events).doesNotContain("done", "error");
    }

    @Test
    void 이동_요청은_제안만_만들고_DB_는_그대로() {
        enableAi();
        Rec r = ask(MOVE);
        assertThat(r.error).isNull();
        assertThat(r.events).containsSubsequence("text", "tool:get_scene", "tool:move_object", "text", "proposal", "done");
        assertThat(r.events.getLast()).isEqualTo("done");
        assertThat(r.tools).containsExactly("장면 확인 중…", "Main Station 1 이동 제안");
        assertThat(r.text.toString()).startsWith("장면을 확인하겠습니다.").contains("제안을 만들었습니다");
        assertThat(r.proposal.items()).hasSize(1);
        assertThat(r.proposal.items().get(0).kind()).isEqualTo("placement.move");
        assertThat(r.proposal.items().get(0).after().path("x").asDouble()).isEqualTo(12);
        assertThat(placementX(ms1)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage where purpose = 'chat' and username = 'kim' and drawing_id = ?",
                Integer.class, drawing)).isEqualTo(3);
        assertThat(r.done.inputTokens()).isEqualTo(3600);
        assertThat(r.done.outputTokens()).isEqualTo(240);
        assertThat(r.done.costUsd()).isEqualByComparingTo("0.019200"); // 3600×4 + 240×20 = 19200 / 1M
        var first = ((FakeGateway.FakeTranscript) store.get("kim", drawing, FakeGateway.FakeTranscript::new).transcript).entries.get(0);
        assertThat(first.userText()).startsWith("[도면: 나셀 공장 · 지금: ").endsWith("]\n" + MOVE);
    }

    @Test
    void 같은_객체를_두_번_옮기면_한_항목() {
        enableAi();
        Rec a = ask(MOVE);
        Rec b = ask(MOVE);
        assertThat(b.proposal.id()).isEqualTo(a.proposal.id());
        assertThat(b.proposal.items()).hasSize(1);
        assertThat(b.proposal.items().get(0).after().path("x").asDouble()).isEqualTo(14);
    }

    @Test
    void 거절이면_그_요청의_제안만_버림() {
        enableAi();
        ask(MOVE);
        var tr = (FakeGateway.FakeTranscript) store.get("kim", drawing, FakeGateway.FakeTranscript::new).transcript;
        int before = tr.entries.size();
        Rec r = ask("거절해 봐");
        assertThat(r.error).isEqualTo("요청을 처리할 수 없습니다 (사유: 시험용 거절)");
        assertThat(r.events).doesNotContain("proposal", "done");
        assertThat(store.get("kim", drawing, FakeGateway.FakeTranscript::new).changeset.items()).hasSize(1); // 앞 요청 것은 남음
        assertThat(tr.entries).hasSize(before); // 거절한 요청은 기록에서도 지움
    }

    @Test
    void 도구_호출은_한_요청에_20번까지() {
        enableAi();
        Rec r = ask("반복");
        assertThat(r.events.stream().filter(e -> e.startsWith("tool:")).count()).isEqualTo(20);
        assertThat(r.text.toString()).contains("작업이 길어 중간에 멈췄습니다.");
        assertThat(r.events.getLast()).isEqualTo("done");
        assertThat(r.events).doesNotContain("proposal");
    }

    @Test
    void 호출_오류와_꺼짐은_한국어로() {
        assertThat(ask("안녕").error).isEqualTo("AI API 키가 등록되지 않았습니다 (관리자 › AI API 관리)");
        enableAi();
        Rec r = ask("오류 내 봐");
        assertThat(r.error).isEqualTo("잠시 뒤 다시 시도하세요 (요청이 많습니다)");
        assertThat(jdbc.queryForObject("select count(*) from ai_usage", Integer.class)).isZero();
    }

    @Test
    void SSE_로_흘려보냄_권한과_입력_검사() throws Exception {
        enableAi();
        MvcResult res = mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"" + MOVE + "\"}").with(OPERATOR).with(csrf()))
                .andExpect(request().asyncStarted()).andReturn();
        res.getAsyncResult(10_000);
        String body = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains("event:text", "event:tool", "\"label\":\"Main Station 1 이동 제안\"", "event:proposal",
                "\"kind\":\"placement.move\"", "\"targetKey\":\"placement:" + ms1 + "\"", "event:done", "\"costUsd\"");
        assertThat(body.indexOf("event:proposal")).isLessThan(body.indexOf("event:done"));

        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"안녕\"}").with(VIEWER).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"  \"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("요청은 1~2000자로 입력하세요."));
        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"drawingId\":" + drawing + ",\"message\":\"" + "가".repeat(2001) + "\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/ai/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"안녕\"}").with(OPERATOR).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("도면을 고르세요."));

        ProposalStore.Conversation before = store.get("kim", drawing, FakeGateway.FakeTranscript::new);
        mvc.perform(post("/api/ai/chat/reset").contentType(MediaType.APPLICATION_JSON).content("{\"drawingId\":" + drawing + "}")
                .with(OPERATOR).with(csrf())).andExpect(status().isNoContent());
        assertThat(store.get("kim", drawing, FakeGateway.FakeTranscript::new)).isNotSameAs(before);
    }
}
