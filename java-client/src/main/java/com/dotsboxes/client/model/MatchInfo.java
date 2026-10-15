package com.dotsboxes.client.model;

public record MatchInfo(
        int roomId,
        String opponentUsername,
        String opponentDisplayName,
        int opponentRanking,
        int localRole
) {
    public static MatchInfo parse(String params) {
        String[] parts = params.split(";", -1);
        if (parts.length < 5) {
            throw new IllegalArgumentException("Invalid match data");
        }
        return new MatchInfo(
                Integer.parseInt(parts[0]),
                parts[1],
                parts[2],
                Integer.parseInt(parts[3]),
                Integer.parseInt(parts[4])
        );
    }
}
