package com.kopens.factory3d.ai;

import com.kopens.factory3d.common.BadRequestException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Claude API 키 암호화 (AES-256-GCM). 저장 형식 = iv 12바이트 + 암호문·태그. 마스터 키는 F3D_AI_MASTER_KEY (base64 32바이트) */
@Component
public class KeyCrypto {
    public static final String NO_MASTER = "F3D_AI_MASTER_KEY 가 설정되지 않아 키를 저장할 수 없습니다";
    private static final Logger log = LoggerFactory.getLogger(KeyCrypto.class);
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key; // null = 마스터 키 없음
    private final SecureRandom random = new SecureRandom();

    public KeyCrypto(@Value("${factory3d.ai.master-key:}") String masterKey) {
        this.key = parse(masterKey);
    }

    static SecretKey parse(String b64) {
        if (b64 == null || b64.isBlank()) return null;
        try {
            byte[] raw = Base64.getDecoder().decode(b64.strip());
            if (raw.length == 32) return new SecretKeySpec(raw, "AES");
            log.warn("F3D_AI_MASTER_KEY 는 base64 32바이트여야 합니다 (지금 {}바이트) — 키 저장을 끕니다", raw.length);
        } catch (IllegalArgumentException e) {
            log.warn("F3D_AI_MASTER_KEY 가 base64 가 아닙니다 — 키 저장을 끕니다");
        }
        return null;
    }

    public boolean available() {
        return key != null;
    }

    public byte[] encrypt(String plain) {
        if (key == null) throw new BadRequestException(NO_MASTER);
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] body = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.allocate(IV_BYTES + body.length).put(iv).put(body).array();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("API 키를 암호화하지 못했습니다.", e);
        }
    }

    public String decrypt(byte[] data) {
        if (key == null) throw new BadRequestException(NO_MASTER);
        if (data == null || data.length <= IV_BYTES) throw new IllegalStateException("저장된 API 키가 올바르지 않습니다.");
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_BYTES));
            return new String(c.doFinal(data, IV_BYTES, data.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("저장된 API 키를 풀지 못했습니다 (마스터 키가 바뀌었을 수 있습니다).", e);
        }
    }
}
