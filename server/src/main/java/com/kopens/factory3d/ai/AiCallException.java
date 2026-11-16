package com.kopens.factory3d.ai;

/** Claude 호출 실패 (메시지는 화면에 그대로 보임) */
public class AiCallException extends RuntimeException {
    public enum Kind { KEY, RATE, NETWORK, OTHER }

    private final Kind kind;

    public AiCallException(Kind kind, Throwable cause) {
        this(kind, null, cause);
    }

    public AiCallException(Kind kind, String detail, Throwable cause) {
        super(text(kind, detail), cause);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    static String text(Kind kind, String detail) {
        return switch (kind) {
            case KEY -> "API 키가 올바르지 않습니다";
            case RATE -> "잠시 뒤 다시 시도하세요 (요청이 많습니다)";
            case NETWORK -> "Claude 서버에 연결하지 못했습니다";
            case OTHER -> "Claude 호출에 실패했습니다" + (detail == null ? "" : " (" + detail + ")");
        };
    }
}
