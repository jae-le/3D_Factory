package com.kopens.factory3d.drawing;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 도면 목록 (조회 이상). 업로드·해석은 P2 */
@RestController
public class DrawingController {
    private final DrawingMapper drawings;

    public DrawingController(DrawingMapper drawings) {
        this.drawings = drawings;
    }

    @GetMapping("/api/drawings")
    public List<DrawingSummary> list() {
        return drawings.findAll();
    }
}
