package com.kopens.factory3d.common;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kopens.factory3d.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class CommonWebTest extends IntegrationTest {

    @Test
    void 상태_확인() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void 없는_API_주소는_ProblemDetail_404() throws Exception {
        mvc.perform(get("/api/no-such"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void 화면_주소는_새로고침해도_index_html() throws Exception {
        mvc.perform(get("/admin/users"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("id=\"root\"")));
        mvc.perform(get("/아무-주소/깊은/곳"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("id=\"root\"")));
    }
}
