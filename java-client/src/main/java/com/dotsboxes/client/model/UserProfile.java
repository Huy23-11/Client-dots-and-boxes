package com.dotsboxes.client.model;

public record UserProfile(
        String username,
        String displayName,
        int ranking,
        String status
) {
    public static UserProfile parse(String params) {
        String[] parts = params.split(";", -1);
        if (parts.length < 4) {
            throw new IllegalArgumentException("Invalid user detail");
        }
        return new UserProfile(parts[0], parts[1], Integer.parseInt(parts[2]), parts[3]);
    }

    public String rankTier() {
        if (ranking >= 5000) return "Thách Đấu";
        if (ranking >= 4000) return "Kim Cương";
        if (ranking >= 3000) return "Bạch Kim";
        if (ranking >= 2000) return "Vàng";
        if (ranking >= 1000) return "Bạc";
        return "Đồng";
    }
}
