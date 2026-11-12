package com.kopens.factory3d.model;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** 모델 라이브러리 (GET 조회, POST 운전원, PATCH·PUT·DELETE 관리자 — SecurityConfig) */
@RestController
@RequestMapping("/api/models")
public class ModelController {
    public record ModelPatch(String name, String category, List<String> aliases) {}

    private final ModelService models;

    public ModelController(ModelService models) {
        this.models = models;
    }

    @GetMapping
    public List<ModelInfo> list() {
        return models.list();
    }

    @GetMapping("/{id}/file")
    public ResponseEntity<Resource> file(@PathVariable long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).immutable())
                .contentType(MediaType.parseMediaType("model/gltf-binary")).body(new FileSystemResource(models.file(id)));
    }

    @GetMapping("/{id}/thumbnail")
    public ResponseEntity<Resource> thumbnail(@PathVariable long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).immutable())
                .contentType(MediaType.IMAGE_PNG).body(new FileSystemResource(models.thumbnail(id)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ModelInfo> create(@RequestParam MultipartFile file, @RequestParam MultipartFile thumbnail,
            @RequestParam String name, @RequestParam String category, @RequestParam String sourceExt,
            @RequestParam double sizeX, @RequestParam double sizeY, @RequestParam double sizeZ,
            @RequestParam(required = false) String aliases, Authentication auth) throws IOException {
        ModelInfo m = models.create(name, category, sourceExt, sizeX, sizeY, sizeZ, aliases, file.getSize(), file.getBytes(),
                thumbnail.getSize(), thumbnail.getBytes(), auth.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(m);
    }

    @PatchMapping("/{id}")
    public ModelInfo update(@PathVariable long id, @RequestBody ModelPatch body) {
        return models.update(id, body.name(), body.category(), body.aliases());
    }

    @PutMapping(value = "/{id}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ModelInfo replaceFile(@PathVariable long id, @RequestParam MultipartFile file, @RequestParam MultipartFile thumbnail,
            @RequestParam String sourceExt, @RequestParam double sizeX, @RequestParam double sizeY,
            @RequestParam double sizeZ) throws IOException {
        return models.replaceFile(id, sourceExt, sizeX, sizeY, sizeZ, file.getSize(), file.getBytes(), thumbnail.getSize(),
                thumbnail.getBytes());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        models.delete(id);
        return ResponseEntity.noContent().build();
    }
}
