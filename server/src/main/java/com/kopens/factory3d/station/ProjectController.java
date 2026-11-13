package com.kopens.factory3d.station;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** PJT (GET 조회 이상, 쓰기 관리자 — SecurityConfig) */
@RestController
public class ProjectController {
    private final ProjectService projects;

    public ProjectController(ProjectService projects) {
        this.projects = projects;
    }

    @GetMapping("/api/drawings/{id}/projects")
    public List<ProjectView> list(@PathVariable long id) {
        return projects.list(id);
    }

    @PostMapping("/api/drawings/{id}/projects")
    public ResponseEntity<ProjectView> create(@PathVariable long id, @RequestBody ProjectService.ProjectInput body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projects.create(id, body));
    }

    @PatchMapping("/api/projects/{id}")
    public ProjectView update(@PathVariable long id, @RequestBody ProjectService.ProjectInput body) {
        return projects.update(id, body);
    }

    @DeleteMapping("/api/projects/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        projects.delete(id);
        return ResponseEntity.noContent().build();
    }
}
