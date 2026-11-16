package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kopens.factory3d.ai.ClaudeGateway.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class FakeGatewayTest {
    final FakeGateway g = new FakeGateway();
    final Call call = new Call("k", "claude-opus-5-5", "sys", List.of(), 16000);

    @Test
    void 장면_확인_뒤_이동_제안_뒤_마무리() {
        Transcript t = g.newTranscript();
        t.addUserText("[도면: 나셀 공장]\nMain Station 1 을 오른쪽으로 2m 옮겨줘");
        List<String> chunks = new ArrayList<>();
        Turn a = g.next(call, t, chunks::add);
        assertThat(String.join("", chunks)).isEqualTo("장면을 확인하겠습니다.");
        assertThat(chunks).hasSize(2);
        assertThat(a.stop()).isEqualTo(Stop.TOOL_USE);
        assertThat(a.toolCalls()).extracting(ToolCall::name).containsExactly("get_scene");
        assertThat(a.usage()).isEqualTo(new Usage("claude-opus-5-5", 1200, 80, 0, 0));

        t.addToolResults(List.of(new ToolResult(a.toolCalls().get(0).id(), "{}", false)));
        Turn b = g.next(call, t, s -> {});
        assertThat(b.toolCalls().get(0).name()).isEqualTo("move_object");
        assertThat(b.toolCalls().get(0).inputJson()).isEqualTo("{\"name\":\"Main Station 1\",\"dx\":2.0,\"dy\":0.0}");

        t.addToolResults(List.of(new ToolResult(b.toolCalls().get(0).id(), "{\"ok\":true}", false)));
        Turn c = g.next(call, t, s -> {});
        assertThat(c.stop()).isEqualTo(Stop.END);
        assertThat(c.text()).contains("제안을 만들었습니다");
        assertThat(t.messages()).isEqualTo(6);
    }

    @Test
    void truncate_는_뒤_항목을_버림() {
        Transcript t = g.newTranscript();
        t.addUserText("a");
        t.addUserText("b");
        t.addUserText("c");
        t.truncate(1);
        assertThat(t.messages()).isEqualTo(1);
    }

    @Test
    void 여러_쓰기_의도() {
        assertThat(secondCall("허브 2 를 90도로 돌려줘")).isEqualTo("rotate_object {\"name\":\"허브 2\",\"rot\":90.0}");
        assertThat(secondCall("허브 2 를 지워줘")).isEqualTo("delete_object {\"name\":\"허브 2\"}");
        assertThat(secondCall("허브 2 이름을 허브 A 로 바꿔줘")).isEqualTo("rename_object {\"name\":\"허브 2\",\"newName\":\"허브 A\"}");
        assertThat(secondCall("Main Station 을 (30, 12)에 추가해줘")).isEqualTo("add_object {\"model\":\"Main Station\",\"x\":30.0,\"y\":12.0}");
        assertThat(secondCall("공정 Hub 조립장 택타임 25분으로")).isEqualTo("set_station {\"name\":\"Hub 조립장\",\"taktMin\":25.0}");
        assertThat(secondCall("가벽 (1, 2)-(5, 2) 추가해줘")).isEqualTo("edit_partition {\"op\":\"add\",\"a\":[1.0,2.0],\"b\":[5.0,2.0]}");
        assertThat(secondCall("안녕")).isEqualTo("END");
    }

    @Test
    void 거절_오류_반복_키() {
        Transcript t = g.newTranscript();
        t.addUserText("거절해 봐");
        Turn r = g.next(call, t, s -> {});
        assertThat(r.stop()).isEqualTo(Stop.REFUSAL);
        assertThat(r.refusal()).isEqualTo("시험용 거절");

        Transcript e = g.newTranscript();
        e.addUserText("오류 내 봐");
        assertThatThrownBy(() -> g.next(call, e, s -> {})).isInstanceOf(AiCallException.class)
                .hasMessage("잠시 뒤 다시 시도하세요 (요청이 많습니다)");

        Transcript loop = g.newTranscript();
        loop.addUserText("반복");
        for (int i = 0; i < 5; i++) {
            Turn x = g.next(call, loop, s -> {});
            assertThat(x.toolCalls().get(0).name()).isEqualTo("get_scene");
            loop.addToolResults(List.of(new ToolResult(x.toolCalls().get(0).id(), "{}", false)));
        }

        assertThat(g.ping("sk-ant-ok", "claude-haiku-5-5").model()).isEqualTo("claude-haiku-5-5");
        assertThatThrownBy(() -> g.ping("sk-ant-invalid", "claude-opus-5-5")).isInstanceOf(AiCallException.class)
                .hasMessage("API 키가 올바르지 않습니다");
    }

    /** 사용자 글 → (장면 확인 뒤) 두 번째 턴의 도구 "이름 입력" 또는 END */
    private String secondCall(String text) {
        Transcript t = g.newTranscript();
        t.addUserText(text);
        Turn a = g.next(call, t, s -> {});
        t.addToolResults(List.of(new ToolResult(a.toolCalls().get(0).id(), "{}", false)));
        Turn b = g.next(call, t, s -> {});
        return b.stop() == Stop.END ? "END" : b.toolCalls().get(0).name() + " " + b.toolCalls().get(0).inputJson();
    }
}
