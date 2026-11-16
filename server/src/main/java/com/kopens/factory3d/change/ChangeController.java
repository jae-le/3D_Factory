package com.kopens.factory3d.change;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

/** 변경 이력 (조회는 관리자 — SecurityConfig). 되돌리기는 운전원 이상 */
@RestController
public class ChangeController {
    private final ChangeLogService changes;

    private final RevertService revert;

    public ChangeController(ChangeLogService changes, RevertService revert) {
        this.changes = changes;
        this.revert = revert;
    }

    @PostMapping("/api/changes/{batchId}/revert")
    public RevertService.Result revert(@PathVariable String batchId, org.springframework.security.core.Authentication auth) {
        boolean admin = auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        return revert.revert(auth.getName(), admin, batchId);
    }

    @GetMapping("/api/changes")
    public ChangeLogService.Page list(@RequestParam(required = false) Long drawingId, @RequestParam(required = false) String source,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page) {
        return changes.list(drawingId, source, from, to, page);
    }
}
