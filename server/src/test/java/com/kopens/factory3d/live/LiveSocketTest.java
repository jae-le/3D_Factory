package com.kopens.factory3d.live;

import static java.util.concurrent.TimeUnit.SECONDS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kopens.factory3d.support.IntegrationTest;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 진짜 서버(임의 포트) + 진짜 로그인 세션으로 WebSocket 접속 (JDK HttpClient 의 WebSocket) */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LiveSocketTest extends IntegrationTest {
    /** 받은 글 메시지·닫힘 코드 */
    static final class Collector implements WebSocket.Listener {
        final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        private final StringBuilder buf = new StringBuilder();

        @Override
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            buf.append(data);
            if (last) {
                messages.add(buf.toString());
                buf.setLength(0);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket ws, int code, String reason) {
            closed.complete(code);
            return null;
        }

        @Override
        public void onError(WebSocket ws, Throwable error) {
            closed.completeExceptionally(error);
        }
    }

    @Value("${local.server.port}") int port;
    @Autowired PasswordEncoder encoder;
    @Autowired VirtualMes mes;
    long drawing;

    @BeforeEach
    void setUp() {
        mes.unloadAll();
        drawing = jdbc.queryForObject("insert into drawing (name, source_type, source_file) values ('공장', 'dxf', 'x') returning id", Long.class);
        jdbc.update("insert into station (drawing_id, sort_order, name, steps) values (?, 1, '공정A', array['a','b'])", drawing);
        jdbc.update("insert into app_user (username, display_name, password_hash, role, must_change_password) values ('kim', '김', ?, 'VIEWER', false)",
                encoder.encode("pass1234"));
    }

    @AfterEach
    void tearDown() {
        mes.unloadAll();
    }

    private String base() {
        return "http://localhost:" + port;
    }

    /** /api/health 로 XSRF-TOKEN 쿠키를 받고 로그인 → "F3D_SESSION=..." */
    private String login() throws Exception {
        var cookies = new CookieManager();
        var http = HttpClient.newBuilder().cookieHandler(cookies).build();
        http.send(HttpRequest.newBuilder(URI.create(base() + "/api/health")).build(), HttpResponse.BodyHandlers.discarding());
        String xsrf = cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("XSRF-TOKEN")).findFirst().orElseThrow().getValue();
        var res = http.send(HttpRequest.newBuilder(URI.create(base() + "/api/auth/login"))
                .header("Content-Type", "application/json").header("X-XSRF-TOKEN", xsrf)
                .POST(HttpRequest.BodyPublishers.ofString("{\"username\":\"kim\",\"password\":\"pass1234\"}")).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(res.statusCode()).isEqualTo(200);
        return cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("F3D_SESSION")).findFirst()
                .map(c -> "F3D_SESSION=" + c.getValue()).orElseThrow();
    }

    private CompletableFuture<WebSocket> open(Collector c, String cookie, String origin, String drawingParam) {
        var b = HttpClient.newHttpClient().newWebSocketBuilder();
        if (cookie != null) b.header("Cookie", cookie);
        if (origin != null) b.header("Origin", origin);
        return b.buildAsync(URI.create("ws://localhost:" + port + "/ws/live" + (drawingParam == null ? "" : "?drawing=" + drawingParam)), c);
    }

    /** 핸드셰이크가 거부된 HTTP 상태 (JDK 는 WebSocketHandshakeException 안에 응답을 담음) */
    private static int rejectedStatus(CompletableFuture<WebSocket> f) {
        Throwable t = catchThrowable(() -> f.get(5, SECONDS));
        while (t != null && !(t instanceof WebSocketHandshakeException)) t = t.getCause();
        assertThat(t).as("핸드셰이크 거부").isInstanceOf(WebSocketHandshakeException.class);
        return ((WebSocketHandshakeException) t).getResponse().statusCode();
    }

    @Test
    void 로그인_안_하면_거부() throws Exception {
        mvc.perform(get("/ws/live").param("drawing", String.valueOf(drawing))).andExpect(status().isUnauthorized());
        assertThat(rejectedStatus(open(new Collector(), null, null, String.valueOf(drawing)))).isEqualTo(401);
    }

    @Test
    void 접속하면_snapshot_먼저_그다음_tick() throws Exception {
        var c = new Collector();
        WebSocket ws = open(c, login(), null, String.valueOf(drawing)).get(5, SECONDS);
        String first = c.messages.poll(5, SECONDS);
        assertThat(first).contains("\"type\":\"snapshot\"").contains("\"name\":\"공정A\"").contains("\"drawingId\":" + drawing);
        mes.advance(1);
        String next;
        do next = c.messages.poll(5, SECONDS);
        while (next != null && !next.contains("\"type\":\"tick\""));
        assertThat(next).contains("\"running\":1");
        ws.sendClose(WebSocket.NORMAL_CLOSURE, "").get(5, SECONDS);
    }

    @Test
    void 없는_도면이나_숫자가_아니거나_빠지면_4404로_닫음() throws Exception {
        String cookie = login();
        var c1 = new Collector();
        open(c1, cookie, null, "999999999").get(5, SECONDS);
        assertThat(c1.closed.get(5, SECONDS)).isEqualTo(4404);
        var c2 = new Collector();
        open(c2, cookie, null, "abc").get(5, SECONDS);
        assertThat(c2.closed.get(5, SECONDS)).isEqualTo(4404);
        var c3 = new Collector();
        open(c3, cookie, null, null).get(5, SECONDS); // drawing 없음
        assertThat(c3.closed.get(5, SECONDS)).isEqualTo(4404);
    }

    @Test
    void 도면이_지워지면_연결을_4404로_닫음() throws Exception {
        var c = new Collector();
        open(c, login(), null, String.valueOf(drawing)).get(5, SECONDS);
        assertThat(c.messages.poll(5, SECONDS)).contains("\"type\":\"snapshot\"");
        mes.unload(drawing); // DrawingDeleted 커밋 뒤와 같음
        assertThat(c.closed.get(5, SECONDS)).isEqualTo(4404);
    }

    @Test
    void 다른_출처는_거부() throws Exception {
        String cookie = login();
        assertThat(rejectedStatus(open(new Collector(), cookie, "http://evil.example", String.valueOf(drawing)))).isEqualTo(403);
    }
}
