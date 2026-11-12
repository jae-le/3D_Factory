package com.kopens.factory3d.loginhistory;

import java.time.OffsetDateTime;

public record LoginEvent(long id, OffsetDateTime at, String username, String result, String detail, String ip,
        String userAgent) {}
