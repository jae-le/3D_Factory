package com.kopens.factory3d.drawing;

import java.io.IOException;
import java.util.List;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

/** 도면 (GET 조회 이상, 쓰기 운전원 이상, 이름 변경·삭제 관리자 — SecurityConfig) */
@RestController
@RequestMapping("/api/drawings")
public class DrawingController {
    public record PlanSave(Integer version, JsonNode plan, JsonNode layerRules, Double scaleFactor) {}

    public record Rename(String name) {}

    private final DrawingService drawings;

    public DrawingController(DrawingService drawings) {
        this.drawings = drawings;
    }

    @GetMapping
    public List<DrawingSummary> list() {
        return drawings.list();
    }

    @GetMapping("/{id}")
    public DrawingDetail get(@PathVariable long id) {
        return drawings.get(id);
    }

    @GetMapping("/{id}/source")
    public ResponseEntity<Resource> source(@PathVariable long id) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/dxf"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("source.dxf").build().toString())
                .body(new FileSystemResource(drawings.source(id)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DrawingDetail> create(@RequestParam("file") MultipartFile file, @RequestParam("name") String name,
            @RequestParam("plan") String plan, @RequestParam(value = "layerRules", required = false) String layerRules,
            Authentication auth) throws IOException {
        // 크기는 메모리에 읽기 전에 확인 (서비스가 크기 검사 뒤에 읽음)
        DrawingDetail d = drawings.create(file.getOriginalFilename(), file.getSize(), file, name, plan, layerRules, auth.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(d);
    }

    @PutMapping("/{id}/plan")
    public DrawingDetail savePlan(@PathVariable long id, @RequestBody PlanSave body, Authentication auth) {
        return drawings.savePlan(id, body.version(), body.plan(), body.layerRules(), body.scaleFactor(), isAdmin(auth));
    }

    private static boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    @PatchMapping("/{id}")
    public DrawingDetail rename(@PathVariable long id, @RequestBody Rename body) {
        return drawings.rename(id, body.name());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        drawings.delete(id);
        return ResponseEntity.noContent().build();
    }
}
