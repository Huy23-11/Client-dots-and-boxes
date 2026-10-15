package com.dotsboxes.client.model;

import java.util.ArrayList;
import java.util.List;

public record MoveResultMessage(
        int playedBy,
        int r1,
        int c1,
        int r2,
        int c2,
        List<BoxPosition> completedBoxes,
        int player1Score,
        int player2Score,
        int nextTurn,
        boolean bonusTurn,
        boolean gameOver,
        int winnerId,
        boolean draw
) {
    public static MoveResultMessage parse(String params) {
        String[] parts = params.split(";", -1);
        if (parts.length < 13) {
            throw new IllegalArgumentException("Invalid move result");
        }
        return new MoveResultMessage(
                Integer.parseInt(parts[0]),
                Integer.parseInt(parts[1]),
                Integer.parseInt(parts[2]),
                Integer.parseInt(parts[3]),
                Integer.parseInt(parts[4]),
                parseBoxes(parts[5]),
                Integer.parseInt(parts[6]),
                Integer.parseInt(parts[7]),
                Integer.parseInt(parts[8]),
                Boolean.parseBoolean(parts[9]),
                Boolean.parseBoolean(parts[10]),
                Integer.parseInt(parts[11]),
                Boolean.parseBoolean(parts[12])
        );
    }

    private static List<BoxPosition> parseBoxes(String raw) {
        List<BoxPosition> boxes = new ArrayList<>();
        if ("NONE".equals(raw) || raw.isBlank()) {
            return boxes;
        }
        for (String item : raw.split("\\|")) {
            String[] coordinates = item.split(":");
            if (coordinates.length == 2) {
                boxes.add(new BoxPosition(
                        Integer.parseInt(coordinates[0]),
                        Integer.parseInt(coordinates[1])
                ));
            }
        }
        return boxes;
    }

    public record BoxPosition(int row, int column) {
    }
}
