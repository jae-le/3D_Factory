package com.kopens.factory3d.change;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

/** 변경 이력 (조회는 관리자 — SecurityConfig). 되돌리기는 Task 6 에서 더함 */
@RestController
public class ChangeController {
    private final ChangeLogService changes;

    public ChangeController(ChangeLogService changes) {
        this.changes = changes;
    }

    @GetMapping("/api/changes")
    public ChangeLogService.Page list(@RequestParam(required = false) Long drawingId, @RequestParam(required = false) String source,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page) {
        return changes.list(drawingId, source, from, to, page);
    }
}
