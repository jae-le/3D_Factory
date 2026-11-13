package com.kopens.factory3d.station;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 공정 기준정보 (GET 조회 이상, 쓰기 관리자 — SecurityConfig) */
@RestController
public class StationController {
    private final StationService stations;

    public StationController(StationService stations) {
        this.stations = stations;
    }

    @GetMapping("/api/drawings/{id}/stations")
    public List<StationView> list(@PathVariable long id) {
        return stations.list(id);
    }

    @PostMapping("/api/drawings/{id}/stations")
    public ResponseEntity<StationView> create(@PathVariable long id, @RequestBody StationService.StationInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(stations.create(id, body));
    }

    @PutMapping("/api/drawings/{id}/stations/order")
    public List<StationView> order(@PathVariable long id, @RequestBody List<Long> ids) {
        return stations.order(id, ids);
    }

    @PatchMapping("/api/stations/{id}")
    public StationView update(@PathVariable long id, @RequestBody StationService.StationInput body) {
        return stations.update(id, body);
    }

    @DeleteMapping("/api/stations/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        stations.delete(id);
        return ResponseEntity.noContent().build();
    }
}
