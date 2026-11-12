package com.kopens.factory3d.auth;

import com.kopens.factory3d.common.BadRequestException;
import java.security.SecureRandom;

/** 비밀번호 규칙과 임시 비밀번호 */
public final class PasswordPolicy {
    public static final String RULE = "비밀번호는 8자 이상, 영문과 숫자를 섞어야 하고 아이디와 달라야 합니다.";
    // 헷갈리는 글자(0·O·1·l·I) 뺌
    private static final String LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final String DIGITS = "23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordPolicy() {}

    public static void check(String username, String password) {
        if (password == null || password.length() < 8 || password.length() > 100
                || !password.chars().anyMatch(Character::isLetter) || !password.chars().anyMatch(Character::isDigit)
                || password.equalsIgnoreCase(username)) throw new BadRequestException(RULE);
    }

    /** 12자 임시 비밀번호 (영문 + 숫자 2개 이상) */
    public static String temporary() {
        var sb = new StringBuilder();
        for (int i = 0; i < 10; i++) sb.append(LETTERS.charAt(RANDOM.nextInt(LETTERS.length())));
        for (int i = 0; i < 2; i++) sb.insert(RANDOM.nextInt(sb.length() + 1), DIGITS.charAt(RANDOM.nextInt(DIGITS.length())));
        return sb.toString();
    }
}
