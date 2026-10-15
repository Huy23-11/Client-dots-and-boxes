package com.dotsboxes.client.ui;

import com.dotsboxes.client.model.MoveResultMessage.BoxPosition;
import java.util.List;
import javafx.scene.Cursor;
import javafx.scene.layout.Pane;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.scene.shape.Line;
import javafx.scene.shape.Rectangle;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import javafx.scene.text.Text;

public final class GameBoardView extends Pane {
    public interface MoveHandler {
        void onMove(int r1, int c1, int r2, int c2);
    }

    private static final int SIZE = 3;
    private static final double CELL = 100;
    private static final double PAD = 36;
    private static final Color EMPTY_EDGE = Color.rgb(255, 255, 255, 0.09);
    private static final Color HOVER_EDGE = Color.rgb(255, 255, 255, 0.55);
    private static final Color DRAWN_EDGE = Color.web("#c4cde8");

    private final Line[][] horizontal = new Line[SIZE + 1][SIZE];
    private final Line[][] vertical = new Line[SIZE][SIZE + 1];
    private final Rectangle[][] boxFills = new Rectangle[SIZE][SIZE];
    private final Text[][] boxMarks = new Text[SIZE][SIZE];
    private boolean canPlay;

    public GameBoardView(MoveHandler moveHandler) {
        setPrefSize(SIZE * CELL + PAD * 2, SIZE * CELL + PAD * 2);
        setMinSize(USE_PREF_SIZE, USE_PREF_SIZE);
        setMaxSize(USE_PREF_SIZE, USE_PREF_SIZE);
        getStyleClass().add("game-board");
        createBoxes();
        createEdges(moveHandler);
        createDots();
    }

    public void setCanPlay(boolean canPlay) {
        this.canPlay = canPlay;
        setCursor(canPlay ? Cursor.HAND : Cursor.DEFAULT);
    }

    public void applyMove(
            int r1,
            int c1,
            int r2,
            int c2,
            List<BoxPosition> completedBoxes,
            int ownerRole
    ) {
        if (r1 == r2) {
            horizontal[r1][Math.min(c1, c2)].setStroke(DRAWN_EDGE);
            horizontal[r1][Math.min(c1, c2)].setStrokeWidth(4);
            horizontal[r1][Math.min(c1, c2)].setUserData(Boolean.TRUE);
        } else {
            vertical[Math.min(r1, r2)][c1].setStroke(DRAWN_EDGE);
            vertical[Math.min(r1, r2)][c1].setStrokeWidth(4);
            vertical[Math.min(r1, r2)][c1].setUserData(Boolean.TRUE);
        }

        Color ownerColor = ownerRole == 1 ? Color.web("#4f8ef7") : Color.web("#f74f5e");
        for (BoxPosition position : completedBoxes) {
            Rectangle fill = boxFills[position.row()][position.column()];
            fill.setFill(Color.color(
                    ownerColor.getRed(), ownerColor.getGreen(), ownerColor.getBlue(), 0.22
            ));
            Text mark = boxMarks[position.row()][position.column()];
            mark.setText(ownerRole == 1 ? "X" : "O");
            mark.setFill(ownerColor);
        }
    }

    private void createBoxes() {
        for (int row = 0; row < SIZE; row++) {
            for (int column = 0; column < SIZE; column++) {
                Rectangle fill = new Rectangle(
                        PAD + column * CELL + 4,
                        PAD + row * CELL + 4,
                        CELL - 8,
                        CELL - 8
                );
                fill.setArcWidth(10);
                fill.setArcHeight(10);
                fill.setFill(Color.TRANSPARENT);
                boxFills[row][column] = fill;

                Text mark = new Text();
                mark.setFont(Font.font("System", FontWeight.BOLD, 36));
                mark.setX(PAD + column * CELL + CELL / 2 - 12);
                mark.setY(PAD + row * CELL + CELL / 2 + 13);
                boxMarks[row][column] = mark;
                getChildren().addAll(fill, mark);
            }
        }
    }

    private void createEdges(MoveHandler moveHandler) {
        for (int row = 0; row <= SIZE; row++) {
            for (int column = 0; column < SIZE; column++) {
                double y = PAD + row * CELL;
                Line edge = interactiveLine(
                        PAD + column * CELL + 9, y,
                        PAD + (column + 1) * CELL - 9, y
                );
                int r = row;
                int c = column;
                configureEdge(edge, () -> moveHandler.onMove(r, c, r, c + 1));
                horizontal[row][column] = edge;
                getChildren().add(edge);
            }
        }

        for (int row = 0; row < SIZE; row++) {
            for (int column = 0; column <= SIZE; column++) {
                double x = PAD + column * CELL;
                Line edge = interactiveLine(
                        x, PAD + row * CELL + 9,
                        x, PAD + (row + 1) * CELL - 9
                );
                int r = row;
                int c = column;
                configureEdge(edge, () -> moveHandler.onMove(r, c, r + 1, c));
                vertical[row][column] = edge;
                getChildren().add(edge);
            }
        }
    }

    private void configureEdge(Line edge, Runnable move) {
        edge.setOnMouseEntered(event -> {
            if (canPlay && !Boolean.TRUE.equals(edge.getUserData())) {
                edge.setStroke(HOVER_EDGE);
                edge.setStrokeWidth(5);
            }
        });
        edge.setOnMouseExited(event -> {
            if (!Boolean.TRUE.equals(edge.getUserData())) {
                edge.setStroke(EMPTY_EDGE);
                edge.setStrokeWidth(18);
            }
        });
        edge.setOnMouseClicked(event -> {
            if (canPlay && !Boolean.TRUE.equals(edge.getUserData())) {
                move.run();
            }
        });
    }

    private static Line interactiveLine(double x1, double y1, double x2, double y2) {
        Line line = new Line(x1, y1, x2, y2);
        line.setStroke(EMPTY_EDGE);
        line.setStrokeWidth(18);
        line.setStrokeLineCap(javafx.scene.shape.StrokeLineCap.ROUND);
        return line;
    }

    private void createDots() {
        for (int row = 0; row <= SIZE; row++) {
            for (int column = 0; column <= SIZE; column++) {
                Circle dot = new Circle(PAD + column * CELL, PAD + row * CELL, 6);
                dot.setFill(Color.web("#4f8ef7"));
                dot.setMouseTransparent(true);
                getChildren().add(dot);
            }
        }
    }
}
