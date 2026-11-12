package com.kopens.factory3d.placement;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 배치 (GET 조회, 쓰기 운전원 — SecurityConfig 기본 규칙) */
@RestController
public class PlacementController {
    private final PlacementService placements;

    public PlacementController(PlacementService placements) {
        this.placements = placements;
    }

    @GetMapping("/api/drawings/{id}/placements")
    public List<PlacementView> list(@PathVariable long id) {
        return placements.list(id);
    }

    @PostMapping("/api/drawings/{id}/placements")
    public ResponseEntity<List<PlacementView>> create(@PathVariable long id, @RequestBody List<PlacementService.NewPlacement> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(placements.create(id, body));
    }

    @PatchMapping("/api/placements/{id}")
    public PlacementView update(@PathVariable long id, @RequestBody PlacementService.Patch body) {
        return placements.update(id, body);
    }

    @DeleteMapping("/api/placements/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        placements.delete(id);
        return ResponseEntity.noContent().build();
    }
}
