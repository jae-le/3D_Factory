package com.kopens.factory3d.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 정해 둔 대본으로 Claude 를 흉내 (factory3d.ai.fake=true — 테스트·화면 확인). 실제 API 를 부르지 않음 */
public class FakeGateway implements ClaudeGateway {
    static final Pattern MOVE = Pattern.compile("(.+?)\\s*[을를]\\s*(오른쪽|왼쪽|위쪽|아래쪽)으로\\s*([0-9]+(?:\\.[0-9]+)?)\\s*m");
    static final Pattern ROTATE = Pattern.compile("(.+?)\\s*[을를]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*도로?\\s*돌려");
    static final Pattern DELETE = Pattern.compile("(.+?)\\s*[을를]\\s*(?:지워|삭제)");
    static final Pattern RENAME = Pattern.compile("(.+?)\\s*이름을\\s*(.+?)\\s*(?:으로|로)\\s*바꿔");
    static final Pattern ADD = Pattern.compile("(.+?)\\s*[을를]\\s*\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)\\s*에\\s*추가");
    static final Pattern TAKT = Pattern.compile("공정\\s+(.+?)\\s*택타임\\s*([0-9]+(?:\\.[0-9]+)?)\\s*분");
    static final Pattern WALL = Pattern.compile("가벽\\s*\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)\\s*-\\s*\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*\\)\\s*추가");

    /** 대본용 기록: 사용자 글 · 응답(도구 호출) · 도구 결과 */
    static final class FakeTranscript implements Transcript {
        record Entry(String userText, List<ToolCall> calls, List<ToolResult> results) {}

        final List<Entry> entries = new ArrayList<>();

        public void addUserText(String text) {
            entries.add(new Entry(text, null, null));
        }

        public void addToolResults(List<ToolResult> results) {
            entries.add(new Entry(null, null, List.copyOf(results)));
        }

        void addAssistant(List<ToolCall> calls) {
            entries.add(new Entry(null, List.copyOf(calls), null));
        }

        public int messages() {
            return entries.size();
        }

        String lastUserText() {
            for (int i = entries.size() - 1; i >= 0; i--) if (entries.get(i).userText() != null) return entries.get(i).userText();
            return "";
        }

        ToolCall lastCall() {
            for (int i = entries.size() - 1; i >= 0; i--)
                if (entries.get(i).calls() != null && !entries.get(i).calls().isEmpty()) return entries.get(i).calls().getLast();
            return null;
        }
    }

    private int ids;

    @Override
    public Transcript newTranscript() {
        return new FakeTranscript();
    }

    @Override
    public synchronized Turn next(Call call, Transcript t, Consumer<String> onText) {
        FakeTranscript ft = (FakeTranscript) t;
        Usage usage = new Usage(call.model(), 1200, 80, 0, 0);
        FakeTranscript.Entry last = ft.entries.getLast();
        String said = strip(ft.lastUserText());
        if (last.userText() != null) {
            if (said.contains("거절")) {
                ft.addAssistant(List.of());
                return new Turn(Stop.REFUSAL, List.of(), "", "시험용 거절", usage);
            }
            if (said.contains("오류")) throw new AiCallException(AiCallException.Kind.RATE, null);
            onText.accept("장면을 ");
            onText.accept("확인하겠습니다.");
            return tool(ft, "get_scene", "{}", "장면을 확인하겠습니다.", usage);
        }
        ToolCall prev = ft.lastCall();
        if (said.contains("반복")) return tool(ft, "get_scene", "{}", "", usage);
        if (prev != null && prev.name().equals("get_scene")) {
            String[] w = intent(said);
            if (w != null) return tool(ft, w[0], w[1], "", usage);
            return end(ft, onText, "무엇을 바꿀지 객체 이름과 함께 알려 주세요.", usage);
        }
        ToolResult r = last.results() == null || last.results().isEmpty() ? null : last.results().getLast();
        if (r != null && r.isError()) return end(ft, onText, "요청한 내용을 처리하지 못했습니다: " + r.content(), usage);
        return end(ft, onText, "제안을 만들었습니다. 3D 미리보기를 확인하고 적용을 눌러 주세요.", usage);
    }

    @Override
    public Ping ping(String apiKey, String model) {
        if (apiKey != null && apiKey.contains("invalid")) throw new AiCallException(AiCallException.Kind.KEY, null);
        return new Ping(model, 5, new Usage(model, 20, 5, 0, 0));
    }

    /** 사용자 글 → {도구 이름, 입력 JSON} (없으면 null) */
    static String[] intent(String s) {
        Matcher m;
        if ((m = WALL.matcher(s)).find())
            return new String[] {"edit_partition", "{\"op\":\"add\",\"a\":[" + num(m.group(1)) + "," + num(m.group(2)) + "],\"b\":["
                    + num(m.group(3)) + "," + num(m.group(4)) + "]}"};
        if ((m = TAKT.matcher(s)).find())
            return new String[] {"set_station", "{\"name\":" + q(m.group(1)) + ",\"taktMin\":" + num(m.group(2)) + "}"};
        if ((m = MOVE.matcher(s)).find()) {
            double d = Double.parseDouble(m.group(3));
            double dx = switch (m.group(2)) { case "오른쪽" -> d; case "왼쪽" -> -d; default -> 0; };
            double dy = switch (m.group(2)) { case "위쪽" -> d; case "아래쪽" -> -d; default -> 0; };
            return new String[] {"move_object", "{\"name\":" + q(m.group(1)) + ",\"dx\":" + (dx + 0.0) + ",\"dy\":" + (dy + 0.0) + "}"};
        }
        if ((m = ROTATE.matcher(s)).find())
            return new String[] {"rotate_object", "{\"name\":" + q(m.group(1)) + ",\"rot\":" + num(m.group(2)) + "}"};
        if ((m = RENAME.matcher(s)).find())
            return new String[] {"rename_object", "{\"name\":" + q(m.group(1)) + ",\"newName\":" + q(m.group(2)) + "}"};
        if ((m = ADD.matcher(s)).find())
            return new String[] {"add_object", "{\"model\":" + q(m.group(1)) + ",\"x\":" + num(m.group(2)) + ",\"y\":" + num(m.group(3)) + "}"};
        if ((m = DELETE.matcher(s)).find()) return new String[] {"delete_object", "{\"name\":" + q(m.group(1)) + "}"};
        return null;
    }

    private Turn tool(FakeTranscript ft, String name, String input, String text, Usage usage) {
        ToolCall c = new ToolCall("fake-" + (++ids), name, input);
        ft.addAssistant(List.of(c));
        return new Turn(Stop.TOOL_USE, List.of(c), text, null, usage);
    }

    private static Turn end(FakeTranscript ft, Consumer<String> onText, String text, Usage usage) {
        onText.accept(text);
        ft.addAssistant(List.of());
        return new Turn(Stop.END, List.of(), text, null, usage);
    }

    /** 맨 앞 "[ … ]" 줄(시스템이 붙인 정보) 빼기 */
    static String strip(String s) {
        StringBuilder out = new StringBuilder();
        for (String line : s.split("\n")) if (!(line.startsWith("[") && line.endsWith("]"))) out.append(line).append('\n');
        return out.toString().strip();
    }

    private static String num(String s) {
        return String.valueOf(Double.parseDouble(s));
    }

    private static String q(String s) {
        return "\"" + s.strip().replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
