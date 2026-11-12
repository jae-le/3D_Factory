package com.kopens.factory3d.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DataDirTest {
    @TempDir Path tmp;

    @Test
    void 상대경로는_절대경로로_바꾸고_폴더를_만듦() {
        Path want = tmp.resolve("sub/data");
        DataDir d = new DataDir(want.toString());
        assertThat(d.root().isAbsolute()).isTrue();
        assertThat(Files.isDirectory(want)).isTrue();
        assertThat(d.resolve("drawings/1/source.dxf")).isEqualTo(want.toAbsolutePath().normalize().resolve("drawings/1/source.dxf"));
    }

    @Test
    void 폴더_밖을_가리키는_경로는_거부() {
        DataDir d = new DataDir(tmp.toString());
        assertThatThrownBy(() -> d.resolve("../escape.txt")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 파일이_있는_자리면_시작_실패() throws Exception {
        Path f = Files.createFile(tmp.resolve("not-a-dir"));
        assertThatThrownBy(() -> new DataDir(f.toString())).isInstanceOf(IllegalStateException.class);
    }
}
