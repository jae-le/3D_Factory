package com.kopens.factory3d.user;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.kopens.factory3d.auth.Role;
import com.kopens.factory3d.auth.UserView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 사용자 관리 API (관리자 — SecurityConfig) */
@RestController
@RequestMapping("/api/users")
public class UserController {
    public record CreateRequest(String username, String displayName, Role role) {}

    public record UpdateRequest(String displayName, Role role, Boolean enabled) {}

    /** 임시 비밀번호는 이 응답에서 한 번만 보여 줌 */
    public record WithTempPassword(
            @Schema(requiredMode = REQUIRED) UserView user, @Schema(requiredMode = REQUIRED) String tempPassword) {}

    private final UserService service;

    public UserController(UserService service) {
        this.service = service;
    }

    @GetMapping
    public List<UserView> list() {
        return service.list().stream().map(UserView::from).toList();
    }

    @PostMapping
    public WithTempPassword create(@RequestBody CreateRequest body) {
        var c = service.create(body.username(), body.displayName(), body.role());
        return new WithTempPassword(UserView.from(c.user()), c.tempPassword());
    }

    @PatchMapping("/{id}")
    public UserView update(@PathVariable long id, @RequestBody UpdateRequest body, Authentication a) {
        return UserView.from(service.update(id, body.displayName(), body.role(), body.enabled(), a.getName()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id, Authentication a) {
        service.delete(id, a.getName());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reset-password")
    public WithTempPassword resetPassword(@PathVariable long id) {
        var c = service.resetPassword(id);
        return new WithTempPassword(UserView.from(c.user()), c.tempPassword());
    }
}
