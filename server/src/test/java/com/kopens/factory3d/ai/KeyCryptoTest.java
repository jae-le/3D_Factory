package com.kopens.factory3d.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kopens.factory3d.common.BadRequestException;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class KeyCryptoTest {
    static final String MASTER = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

    @Test
    void 암호화_왕복과_매번_다른_암호문() {
        KeyCrypto c = new KeyCrypto(MASTER);
        assertThat(c.available()).isTrue();
        byte[] a = c.encrypt("sk-ant-api03-hello");
        byte[] b = c.encrypt("sk-ant-api03-hello");
        assertThat(a).isNotEqualTo(b); // iv 가 매번 다름
        assertThat(new String(a)).doesNotContain("hello");
        assertThat(c.decrypt(a)).isEqualTo("sk-ant-api03-hello");
        assertThat(c.decrypt(b)).isEqualTo("sk-ant-api03-hello");
    }

    @Test
    void 마스터_키가_없거나_형식이_틀리면_쓸_수_없음() {
        assertThat(new KeyCrypto("").available()).isFalse();
        assertThat(new KeyCrypto(null).available()).isFalse();
        assertThat(new KeyCrypto("@@@ not base64").available()).isFalse();
        assertThat(new KeyCrypto(Base64.getEncoder().encodeToString(new byte[31])).available()).isFalse();
        assertThatThrownBy(() -> new KeyCrypto("").encrypt("x"))
                .isInstanceOf(BadRequestException.class).hasMessage(KeyCrypto.NO_MASTER);
    }

    @Test
    void 다른_마스터_키로는_풀지_못함() {
        byte[] enc = new KeyCrypto(MASTER).encrypt("sk-ant-secret");
        KeyCrypto other = new KeyCrypto(Base64.getEncoder().encodeToString("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz".getBytes()));
        assertThatThrownBy(() -> other.decrypt(enc)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("마스터 키가 바뀌었을 수 있습니다");
    }
}
