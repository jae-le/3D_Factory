package com.kopens.factory3d.drawing;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.security.test.context.support.WithMockUser;

@WithMockUser(username = "viewer", roles = "VIEWER")
class DrawingApiTest extends IntegrationTest {

    @Test
    void 도면이_없으면_빈_목록() throws Exception {
        mvc.perform(get("/api/drawings")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void 도면_목록은_등록순() throws Exception {
        jdbc.update("insert into drawing (name, source_type, source_file) values ('나셀 공장', 'dxf', 'drawings/1/a.dxf')");
        jdbc.update("insert into drawing (name, source_type, source_file) values ('2공장', 'image', 'drawings/2/b.png')");
        mvc.perform(get("/api/drawings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("나셀 공장"))
                .andExpect(jsonPath("$[0].sourceType").value("dxf"))
                .andExpect(jsonPath("$[1].name").value("2공장"))
                .andExpect(jsonPath("$[1].updatedAt").exists());
    }
}
