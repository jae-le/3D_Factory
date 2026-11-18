package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kopens.factory3d.ai.ClaudeGateway.Call;
import com.kopens.factory3d.ai.ClaudeGateway.Stop;
import com.kopens.factory3d.ai.ClaudeGateway.ToolResult;
import com.kopens.factory3d.ai.ClaudeGateway.ToolSpec;
import com.kopens.factory3d.ai.ClaudeGateway.Turn;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 가짜 HTTP 서버로 Gemini REST 형식(SSE)을 흉내 내어 확인 */
class GeminiGatewayTest {
    record Reply(int status, String body) {}

    HttpServer server;
    final ConcurrentLinkedDeque<Reply> replies = new ConcurrentLinkedDeque<>();
    final List<String> paths = new ArrayList<>();
    final List<JsonNode> bodies = new ArrayList<>();
    final List<String> keys = new ArrayList<>();
    GeminiGateway g;

    static final List<ToolSpec> TOOLS = List.of(
            new ToolSpec("get_scene", "장면", "{\"type\":\"object\",\"properties\":{},\"required\":[],\"additionalProperties\":false}"),
            new ToolSpec("move_object", "옮김",
                    "{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"],\"additionalProperties\":false}"));

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            paths.add(ex.getRequestURI().toString());
            keys.add(ex.getRequestHeaders().getFirst("x-goog-api-key"));
            bodies.add(JsonMapper.builder().build().readTree(ex.getRequestBody().readAllBytes()));
            Reply r = replies.poll();
            byte[] b = r.body().getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(r.status(), b.length);
            ex.getResponseBody().write(b);
            ex.close();
        });
        server.start();
        g = new GeminiGateway("http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta");
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    static String sse(String... chunks) {
        StringBuilder sb = new StringBuilder();
        for (String c : chunks) sb.append("data: ").append(c).append("\r\n\r\n");
        return sb.toString();
    }

    static Call call() {
        return new Call("AIza-test-key-000000000000", "gemini-2.5-flash", "너는 공장 도우미", TOOLS, 4096);
    }

    @Test
    void 글을_흘리고_끝나면_END_사용량() {
        replies.add(new Reply(200, sse(
                "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"안녕\"}]}}]}",
                "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"하세요\"}]},\"finishReason\":\"STOP\"}],"
                        + "\"usageMetadata\":{\"promptTokenCount\":120,\"candidatesTokenCount\":5,\"thoughtsTokenCount\":3,\"cachedContentTokenCount\":20}}")));
        Transcript t = g.newTranscript();
        t.addUserText("안녕?");
        List<String> got = new ArrayList<>();
        Turn turn = g.next(call(), t, got::add);
        assertThat(got).containsExactly("안녕", "하세요");
        assertThat(turn.stop()).isEqualTo(Stop.END);
        assertThat(turn.text()).isEqualTo("안녕하세요");
        assertThat(turn.usage()).isEqualTo(new ClaudeGateway.Usage("gemini-2.5-flash", 100, 8, 20, 0));
        assertThat(t.messages()).isEqualTo(2);
        assertThat(paths.get(0)).isEqualTo("/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
        assertThat(keys.get(0)).isEqualTo("AIza-test-key-000000000000");
        JsonNode req = bodies.get(0);
        assertThat(req.at("/systemInstruction/parts/0/text").asString()).isEqualTo("너는 공장 도우미");
        assertThat(req.at("/generationConfig/maxOutputTokens").asInt()).isEqualTo(4096);
        JsonNode decls = req.at("/tools/0/functionDeclarations");
        assertThat(decls.get(0).has("parameters")).isFalse(); // 빈 object 는 생략
        assertThat(decls.get(1).at("/parameters/required/0").asString()).isEqualTo("name");
        assertThat(decls.get(1).get("parameters").has("additionalProperties")).isFalse();
    }

    @Test
    void 도구_호출과_결과_서명은_그대로_다음_요청에() {
        replies.add(new Reply(200, sse("{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"name\":\"move_object\","
                + "\"args\":{\"name\":\"허브 1\"}},\"thoughtSignature\":\"SIG\"}]},\"finishReason\":\"STOP\"}]}")));
        replies.add(new Reply(200, sse("{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"옮겼어요\"}]},\"finishReason\":\"STOP\"}]}")));
        Transcript t = g.newTranscript();
        t.addUserText("허브 옮겨");
        Turn first = g.next(call(), t, s -> {});
        assertThat(first.stop()).isEqualTo(Stop.TOOL_USE);
        assertThat(first.toolCalls()).hasSize(1);
        assertThat(first.toolCalls().get(0).name()).isEqualTo("move_object");
        assertThat(first.toolCalls().get(0).inputJson()).isEqualTo("{\"name\":\"허브 1\"}");
        t.addToolResults(List.of(new ToolResult(first.toolCalls().get(0).id(), "제안 #1", false)));
        Turn second = g.next(call(), t, s -> {});
        assertThat(second.stop()).isEqualTo(Stop.END);
        JsonNode contents = bodies.get(1).get("contents");
        assertThat(contents.size()).isEqualTo(3);
        assertThat(contents.at("/1/role").asString()).isEqualTo("model");
        assertThat(contents.at("/1/parts/0/thoughtSignature").asString()).isEqualTo("SIG");
        assertThat(contents.at("/2/parts/0/functionResponse/name").asString()).isEqualTo("move_object");
        assertThat(contents.at("/2/parts/0/functionResponse/response/result").asString()).isEqualTo("제안 #1");
    }

    @Test
    void 막히면_REFUSAL_기록에_안_남김() {
        replies.add(new Reply(200, sse("{\"candidates\":[{\"finishReason\":\"SAFETY\"}]}")));
        Transcript t = g.newTranscript();
        t.addUserText("x");
        Turn turn = g.next(call(), t, s -> {});
        assertThat(turn.stop()).isEqualTo(Stop.REFUSAL);
        assertThat(turn.refusal()).contains("SAFETY");
        assertThat(t.messages()).isEqualTo(1);
    }

    @Test
    void HTTP_오류_문구() {
        replies.add(new Reply(400, "{\"error\":{\"code\":400,\"message\":\"API key not valid.\",\"status\":\"INVALID_ARGUMENT\","
                + "\"details\":[{\"reason\":\"API_KEY_INVALID\"}]}}"));
        assertThatThrownBy(() -> g.ping("bad", "gemini-2.5-flash")).isInstanceOf(AiCallException.class)
                .satisfies(e -> assertThat(((AiCallException) e).kind()).isEqualTo(AiCallException.Kind.KEY));
        replies.add(new Reply(429, "{\"error\":{\"code\":429,\"message\":\"quota\",\"status\":\"RESOURCE_EXHAUSTED\"}}"));
        assertThatThrownBy(() -> g.ping("k", "gemini-2.5-flash"))
                .satisfies(e -> assertThat(((AiCallException) e).kind()).isEqualTo(AiCallException.Kind.RATE));
        replies.add(new Reply(404, "{\"error\":{\"code\":404,\"message\":\"not found\",\"status\":\"NOT_FOUND\"}}"));
        assertThatThrownBy(() -> g.ping("k", "gemini-9")).hasMessageContaining("모델을 쓸 수 없습니다: not found");
    }

    @Test
    void 연결_테스트() {
        replies.add(new Reply(200, "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"pong\"}]}}],"
                + "\"usageMetadata\":{\"promptTokenCount\":3,\"candidatesTokenCount\":1}}"));
        var p = g.ping("k", "gemini-2.5-flash");
        assertThat(p.model()).isEqualTo("gemini-2.5-flash");
        assertThat(p.usage().input()).isEqualTo(3);
        assertThat(paths.get(0)).endsWith(":generateContent");
    }

    @Test
    void 라우팅_모델_이름으로_제공자_고름() {
        replies.add(new Reply(200, sse("{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"G\"}]},\"finishReason\":\"STOP\"}]}")));
        RoutingGateway r = new RoutingGateway(new FakeGateway(), g);
        Transcript t = r.newTranscript();
        t.addUserText("첫 질문");
        assertThat(t.messages()).isEqualTo(1);
        assertThat(r.next(call(), t, s -> {}).text()).isEqualTo("G");
        assertThat(t.messages()).isEqualTo(2);
        assertThat(bodies.get(0).at("/contents/0/parts/0/text").asString()).isEqualTo("첫 질문");
        assertThat(RoutingGateway.isGemini("gemini-2.5-flash")).isTrue();
        assertThat(RoutingGateway.isGemini("claude-opus-5-5")).isFalse();
    }
}
