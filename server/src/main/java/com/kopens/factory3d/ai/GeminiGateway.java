package com.kopens.factory3d.ai;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Google Gemini 호출 (REST · streamGenerateContent?alt=sse). SDK 없이 JDK HttpClient.
 * 규칙: 응답 parts 는 thoughtSignature 까지 그대로 다음 요청에 · 도구 결과는 functionResponse(이름 필요 → 호출 id 로 기억) ·
 * 도구 스키마는 Gemini 가 받는 부분만(additionalProperties 빼고, 빈 object 는 parameters 생략).
 */
public class GeminiGateway implements ClaudeGateway {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(GeminiGateway.class);
    static final String BASE = "https://generativelanguage.googleapis.com/v1beta";
    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final Set<String> REFUSALS = Set.of("SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY");

    /** 바쁨(503)·요청 많음(429) 이면 기다렸다 다시 (ms). 테스트는 짧게 */
    long[] retryWaitsMs = {1500, 4000};
    private final String base;
    // HTTP/1.1: JDK 의 HTTP/2 로 Google 에 붙으면 응답을 못 받고 멈추는 경우가 있어 단순한 쪽으로
    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(15)).build();

    public GeminiGateway() {
        this(BASE);
    }

    GeminiGateway(String base) {
        this.base = base;
    }

    static final class GeminiTranscript implements Transcript {
        final List<ObjectNode> contents = new ArrayList<>();
        final Map<String, String> toolNames = new HashMap<>(); // 호출 id → 도구 이름 (functionResponse 에 필요)
        final Map<String, String> geminiIds = new HashMap<>(); // 우리 id → Gemini 가 준 id (없으면 빠짐)

        public void addUserText(String text) {
            addUser(text, List.of());
        }

        public void addUser(String text, List<Image> images) {
            ObjectNode c = JSON.createObjectNode().put("role", "user");
            ArrayNode parts = c.putArray("parts");
            if (images != null)
                for (Image im : images) parts.addObject().putObject("inlineData").put("mimeType", im.mediaType()).put("data", im.base64());
            parts.addObject().put("text", text);
            contents.add(c);
        }

        public void addToolResults(List<ToolResult> results) {
            ObjectNode c = JSON.createObjectNode().put("role", "user");
            ArrayNode parts = c.putArray("parts");
            for (ToolResult r : results) {
                ObjectNode fr = parts.addObject().putObject("functionResponse");
                fr.put("name", toolNames.getOrDefault(r.toolUseId(), "unknown"));
                String gid = geminiIds.get(r.toolUseId());
                if (gid != null) fr.put("id", gid);
                fr.putObject("response").put(r.isError() ? "error" : "result", r.content());
            }
            contents.add(c);
        }

        public int messages() {
            return contents.size();
        }

        public void truncate(int n) {
            while (contents.size() > n) contents.removeLast();
        }
    }

    @Override
    public Transcript newTranscript() {
        return new GeminiTranscript();
    }

    @Override
    public Turn next(Call call, Transcript t, Consumer<String> onText) {
        GeminiTranscript tr = (GeminiTranscript) t;
        ObjectNode body = JSON.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", call.system());
        ArrayNode contents = body.putArray("contents");
        tr.contents.forEach(contents::add);
        if (!call.tools().isEmpty()) {
            ArrayNode decls = body.putArray("tools").addObject().putArray("functionDeclarations");
            for (ToolSpec s : call.tools()) decls.add(declaration(s));
        }
        body.putObject("generationConfig").put("maxOutputTokens", call.maxTokens());
        think(body, call.model(), "low");

        HttpResponse<InputStream> res = sendThinking(call.apiKey(), call.model(), "streamGenerateContent?alt=sse", body, Duration.ofSeconds(90));
        List<ObjectNode> parts = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        List<ToolCall> calls = new ArrayList<>();
        String finish = null, block = null;
        JsonNode usage = null;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(res.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (!line.startsWith("data:")) continue;
                JsonNode chunk = JSON.readTree(line.substring(5).trim());
                if (chunk.has("usageMetadata")) usage = chunk.get("usageMetadata");
                String br = chunk.path("promptFeedback").path("blockReason").asString(null);
                if (br != null) block = br;
                JsonNode cand = chunk.path("candidates").path(0);
                String fr = cand.path("finishReason").asString(null);
                if (fr != null) finish = fr;
                for (JsonNode p : cand.path("content").path("parts")) {
                    ObjectNode part = (ObjectNode) p.deepCopy();
                    parts.add(part);
                    if (p.has("functionCall")) {
                        JsonNode fc = p.get("functionCall");
                        String id = "call_" + (tr.toolNames.size() + 1);
                        tr.toolNames.put(id, fc.path("name").asString());
                        String gid = fc.path("id").asString(null);
                        if (gid != null) tr.geminiIds.put(id, gid);
                        JsonNode args = fc.has("args") ? fc.get("args") : JSON.createObjectNode();
                        calls.add(new ToolCall(id, fc.path("name").asString(), JSON.writeValueAsString(args)));
                    } else if (p.has("text") && !p.path("thought").asBoolean(false)) {
                        String s = p.get("text").asString();
                        text.append(s);
                        if (!s.isEmpty()) onText.accept(s);
                    }
                }
            }
        } catch (IOException e) {
            throw new AiCallException(AiCallException.Kind.NETWORK, e);
        }
        Usage u = usage(call.model(), usage);
        if (block != null || (finish != null && REFUSALS.contains(finish)))
            return new Turn(Stop.REFUSAL, List.of(), text.toString(), "Gemini 가 답을 막았습니다 (" + (block != null ? block : finish) + ")", u);
        if (!parts.isEmpty()) {
            ObjectNode c = JSON.createObjectNode().put("role", "model");
            ArrayNode ps = c.putArray("parts");
            parts.forEach(ps::add);
            tr.contents.add(c);
        }
        Stop stop = !calls.isEmpty() ? Stop.TOOL_USE
                : "MAX_TOKENS".equals(finish) ? Stop.MAX_TOKENS
                : finish == null || "STOP".equals(finish) ? Stop.END : Stop.OTHER;
        return new Turn(stop, stop == Stop.TOOL_USE ? calls : List.of(), text.toString(), null, u);
    }

    @Override
    public Ping ping(String apiKey, String model) {
        ObjectNode body = JSON.createObjectNode();
        body.putArray("contents").addObject().put("role", "user").putArray("parts").addObject().put("text", "ping");
        body.putObject("generationConfig").put("maxOutputTokens", 64);
        think(body, model, "minimal");
        long t0 = System.nanoTime();
        HttpResponse<InputStream> res = sendThinking(apiKey, model, "generateContent", body, Duration.ofSeconds(60));
        try (InputStream in = res.body()) {
            JsonNode j = JSON.readTree(in);
            return new Ping(model, (System.nanoTime() - t0) / 1_000_000, usage(model, j.get("usageMetadata")));
        } catch (IOException e) {
            throw new AiCallException(AiCallException.Kind.NETWORK, e);
        }
    }

    @Override
    public List<ModelOption> geminiModels(String apiKey) {
        HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/models?pageSize=200"))
                .timeout(Duration.ofSeconds(20)).header("x-goog-api-key", apiKey).GET().build();
        HttpResponse<InputStream> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException e) {
            throw new AiCallException(AiCallException.Kind.NETWORK, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiCallException(AiCallException.Kind.NETWORK, e);
        }
        if (res.statusCode() >= 400) throw error(res);
        List<ModelOption> out = new ArrayList<>();
        try (InputStream in = res.body()) {
            for (JsonNode m : JSON.readTree(in).path("models")) {
                String id = m.path("name").asString("").replaceFirst("^models/", "");
                boolean gen = false;
                for (JsonNode g : m.path("supportedGenerationMethods")) gen |= "generateContent".equals(g.asString());
                if (gen && id.matches("gemini-[a-z0-9][a-z0-9.-]{0,32}")) out.add(new ModelOption(id, m.path("displayName").asString(id)));
            }
        } catch (IOException e) {
            throw new AiCallException(AiCallException.Kind.NETWORK, e);
        }
        return out;
    }

    /** Gemini 3 계열은 답 전에 오래 생각할 수 있어 수준을 낮춤 (붐빌 때 첫 응답이 수십 초 늦어짐) */
    static void think(ObjectNode body, String model, String level) {
        if (model.startsWith("gemini-3")) ((ObjectNode) body.get("generationConfig")).putObject("thinkingConfig").put("thinkingLevel", level);
    }

    /** 모델이 생각 수준 설정을 받지 않으면(400) 빼고 한 번 더 */
    private HttpResponse<InputStream> sendThinking(String apiKey, String model, String method, ObjectNode body, Duration wait) {
        long t0 = System.nanoTime();
        try {
            return send(apiKey, model, method, body, wait);
        } catch (AiCallException e) {
            ObjectNode gc = (ObjectNode) body.get("generationConfig");
            if (!gc.has("thinkingConfig") || e.getMessage() == null || !e.getMessage().toLowerCase().contains("think")) throw e;
            gc.remove("thinkingConfig");
            return send(apiKey, model, method, body, wait);
        } finally {
            log.info("Gemini {} {} 첫 응답까지 {} ms", model, method.replaceFirst("\\?.*", ""), (System.nanoTime() - t0) / 1_000_000);
        }
    }

    /** Gemini 함수 선언: 스키마에서 받지 않는 키를 빼고, 속성이 없으면 parameters 를 생략 */
    static ObjectNode declaration(ToolSpec s) {
        ObjectNode d = JSON.createObjectNode().put("name", s.name()).put("description", s.description());
        JsonNode schema = clean(JSON.readTree(s.inputSchemaJson()));
        if (schema.path("properties").size() > 0) d.set("parameters", schema);
        return d;
    }

    private static JsonNode clean(JsonNode n) {
        if (n instanceof ObjectNode o) {
            o.remove("additionalProperties");
            o.remove("$schema");
            for (String k : new ArrayList<>(o.propertyNames())) clean(o.get(k));
        } else if (n instanceof ArrayNode a) {
            a.forEach(GeminiGateway::clean);
        }
        return n;
    }

    private static Usage usage(String model, JsonNode m) {
        if (m == null) return new Usage(model, 0, 0, 0, 0);
        long cached = m.path("cachedContentTokenCount").asLong(0);
        long prompt = m.path("promptTokenCount").asLong(0);
        long out = m.path("candidatesTokenCount").asLong(0) + m.path("thoughtsTokenCount").asLong(0);
        return new Usage(model, Math.max(0, prompt - cached), out, cached, 0);
    }

    /** wait: 응답 머리(첫 바이트)까지 기다리는 최대 시간 */
    private HttpResponse<InputStream> send(String apiKey, String model, String method, ObjectNode body, Duration wait) {
        String url = base + "/models/" + URLEncoder.encode(model, StandardCharsets.UTF_8) + ":" + method;
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(wait)
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                .build();
        HttpResponse<InputStream> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            for (int i = 0; i < retryWaitsMs.length && (res.statusCode() == 503 || res.statusCode() == 429); i++) {
                res.body().close();
                Thread.sleep(retryWaitsMs[i]);
                res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            }
        } catch (java.net.http.HttpTimeoutException e) {
            throw new AiCallException(AiCallException.Kind.OTHER, "Gemini 가 " + wait.toSeconds() + "초 안에 답하지 않았습니다 — 잠시 뒤 다시 시도하세요", e);
        } catch (IOException e) {
            throw new AiCallException(AiCallException.Kind.NETWORK, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AiCallException(AiCallException.Kind.NETWORK, e);
        }
        if (res.statusCode() >= 400) throw error(res);
        return res;
    }

    /** HTTP 오류 → 화면 문구. 키 오류는 400(API_KEY_INVALID) 로도 옴 */
    static AiCallException error(HttpResponse<InputStream> res) {
        String raw;
        try (InputStream in = res.body()) {
            raw = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            raw = "";
        }
        String msg = null, status = null;
        try {
            JsonNode err = JSON.readTree(raw).path("error");
            msg = err.path("message").asString(null);
            status = err.path("status").asString(null);
        } catch (RuntimeException ignore) {
            // 본문이 JSON 이 아님
        }
        int code = res.statusCode();
        RuntimeException cause = new RuntimeException("Gemini HTTP " + code + " " + status + ": " + msg);
        if (code == 401 || code == 403 || raw.contains("API_KEY_INVALID")) return new AiCallException(AiCallException.Kind.KEY, cause);
        if (code == 429) return new AiCallException(AiCallException.Kind.RATE, cause);
        if (code == 503) return new AiCallException(AiCallException.Kind.OTHER, "Gemini 가 지금 붐빕니다 — 잠시 뒤 다시 시도하거나 다른 모델을 고르세요", cause);
        if (code == 404) return new AiCallException(AiCallException.Kind.OTHER, "모델을 쓸 수 없습니다" + (msg == null ? "" : ": " + msg), cause);
        return new AiCallException(AiCallException.Kind.OTHER, msg == null ? "HTTP " + code : msg, cause);
    }
}
