package com.dotsboxes.client.ui;

import com.dotsboxes.client.model.MatchInfo;
import com.dotsboxes.client.model.MoveResultMessage;
import com.dotsboxes.client.model.UserProfile;
import java.util.function.Consumer;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

public final class GameView extends BorderPane {
    public record EdgeMove(int r1, int c1, int r2, int c2) {
    }

    private final int localRole;
    private final Consumer<EdgeMove> onMove;
    private final Runnable onSurrender;
    private final GameBoardView board;
    private final Label localScore = scoreLabel();
    private final Label opponentScore = scoreLabel();
    private final Label status = new Label();
    private final Label remaining = new Label("9 ô còn lại");
    private final Button homeButton = new Button("VỀ SẢNH");
    private int activeRole = 1;
    private int claimedBoxes;
    private boolean awaitingMove;
    private boolean gameOver;

    public GameView(
            UserProfile user,
            MatchInfo match,
            Consumer<EdgeMove> onMove,
            Runnable onSurrender,
            Runnable onHome
    ) {
        this.localRole = match.localRole();
        this.onMove = onMove;
        this.onSurrender = onSurrender;
        getStyleClass().add("screen");

        setTop(buildHeader(match.roomId()));
        board = new GameBoardView(this::requestMove);

        VBox center = new VBox(
                22,
                buildPlayers(user, match),
                board,
                buildStatusBar()
        );
        center.setAlignment(Pos.CENTER);
        center.setPadding(new Insets(22));
        setCenter(center);

        homeButton.getStyleClass().add("ghost-button");
        homeButton.setVisible(false);
        homeButton.setManaged(false);
        homeButton.setOnAction(event -> onHome.run());
        updateTurnState();
    }

    private HBox buildHeader(int roomId) {
        Label title = new Label("DOTS & BOXES  •  PHÒNG #" + roomId + "  •  3×3");
        title.getStyleClass().add("header-name");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        remaining.getStyleClass().add("muted");
        HBox header = new HBox(12, title, spacer, remaining);
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(14, 20, 14, 20));
        header.getStyleClass().add("top-bar");
        return header;
    }

    private HBox buildPlayers(UserProfile user, MatchInfo match) {
        VBox local = playerCard(
                localRole == 1 ? "X" : "O",
                user.displayName(),
                user.rankTier(),
                localScore,
                localRole
        );
        VBox opponent = playerCard(
                localRole == 1 ? "O" : "X",
                match.opponentDisplayName(),
                rankTier(match.opponentRanking()),
                opponentScore,
                localRole == 1 ? 2 : 1
        );
        Label versus = new Label("VS");
        versus.getStyleClass().add("versus");
        HBox row = new HBox(24, local, versus, opponent);
        row.setAlignment(Pos.CENTER);
        return row;
    }

    private HBox buildStatusBar() {
        status.getStyleClass().add("game-status");
        status.setMinWidth(320);
        Button surrender = new Button("BỎ CUỘC");
        surrender.getStyleClass().add("danger-button");
        surrender.setOnAction(event -> confirmSurrender());
        HBox bar = new HBox(14, status, surrender, homeButton);
        bar.setAlignment(Pos.CENTER);
        bar.getStyleClass().add("status-bar");
        bar.setPadding(new Insets(12, 18, 12, 18));
        return bar;
    }

    private void requestMove(int r1, int c1, int r2, int c2) {
        if (gameOver || awaitingMove || activeRole != localRole) {
            return;
        }
        awaitingMove = true;
        board.setCanPlay(false);
        status.setText("Đang chờ server xác thực nước đi...");
        onMove.accept(new EdgeMove(r1, c1, r2, c2));
    }

    public void applyMove(MoveResultMessage result) {
        boolean gameWasAlreadyFinished = gameOver;
        int moveOwnerRole = activeRole;
        board.applyMove(
                result.r1(),
                result.c1(),
                result.r2(),
                result.c2(),
                result.completedBoxes(),
                moveOwnerRole
        );
        claimedBoxes += result.completedBoxes().size();
        remaining.setText(Math.max(0, 9 - claimedBoxes) + " ô còn lại");

        int localPoints = localRole == 1 ? result.player1Score() : result.player2Score();
        int opponentPoints = localRole == 1 ? result.player2Score() : result.player1Score();
        localScore.setText(String.valueOf(localPoints));
        opponentScore.setText(String.valueOf(opponentPoints));

        if (!result.bonusTurn()) {
            activeRole = activeRole == 1 ? 2 : 1;
        }
        awaitingMove = false;
        if (!gameWasAlreadyFinished) {
            updateTurnState();
        }
    }

    public void rejectMove(String reason) {
        awaitingMove = false;
        status.setText("Server từ chối nước đi: " + reason);
        board.setCanPlay(activeRole == localRole && !gameOver);
    }

    public void finish(String params) {
        String[] parts = params.split(";", -1);
        gameOver = true;
        awaitingMove = false;
        board.setCanPlay(false);

        if (parts.length >= 5) {
            int p1Score = Integer.parseInt(parts[1]);
            int p2Score = Integer.parseInt(parts[2]);
            boolean draw = Boolean.parseBoolean(parts[3]);
            int localPoints = localRole == 1 ? p1Score : p2Score;
            int opponentPoints = localRole == 1 ? p2Score : p1Score;
            localScore.setText(String.valueOf(localPoints));
            opponentScore.setText(String.valueOf(opponentPoints));
            status.setText(draw
                    ? "HÒA • " + localPoints + " – " + opponentPoints
                    : localPoints > opponentPoints
                            ? "CHIẾN THẮNG • " + localPoints + " – " + opponentPoints
                            : "THUA CUỘC • " + localPoints + " – " + opponentPoints);
        } else {
            status.setText("Trận đấu đã kết thúc.");
        }
        homeButton.setVisible(true);
        homeButton.setManaged(true);
    }

    public void showOpponentEvent(String message) {
        status.setText(message);
    }

    private void updateTurnState() {
        boolean localTurn = activeRole == localRole;
        board.setCanPlay(localTurn && !awaitingMove && !gameOver);
        status.setText(localTurn
                ? "Lượt của bạn — hãy chọn một cạnh."
                : "Đang chờ đối thủ nối cạnh...");
    }

    private void confirmSurrender() {
        Alert alert = new Alert(
                Alert.AlertType.CONFIRMATION,
                "Server sẽ xử thua ngay khi bạn bỏ cuộc.",
                ButtonType.CANCEL,
                ButtonType.OK
        );
        alert.setTitle("Bỏ cuộc");
        alert.setHeaderText("Bạn có chắc muốn bỏ cuộc?");
        alert.showAndWait().filter(ButtonType.OK::equals).ifPresent(button -> {
            board.setCanPlay(false);
            status.setText("Đang gửi yêu cầu bỏ cuộc...");
            onSurrender.run();
        });
    }

    private static VBox playerCard(
            String symbol,
            String name,
            String rank,
            Label score,
            int role
    ) {
        Label symbolLabel = new Label(symbol);
        symbolLabel.getStyleClass().addAll("player-symbol", role == 1 ? "blue" : "red");
        Label nameLabel = new Label(name);
        nameLabel.getStyleClass().add("player-name");
        Label rankLabel = new Label(rank);
        rankLabel.getStyleClass().add("rank-label");
        VBox card = new VBox(5, symbolLabel, nameLabel, rankLabel, score);
        card.setAlignment(Pos.CENTER);
        card.getStyleClass().add("player-card");
        return card;
    }

    private static Label scoreLabel() {
        Label label = new Label("0");
        label.getStyleClass().add("score");
        return label;
    }

    private static String rankTier(int ranking) {
        if (ranking >= 5000) return "Thách Đấu";
        if (ranking >= 4000) return "Kim Cương";
        if (ranking >= 3000) return "Bạch Kim";
        if (ranking >= 2000) return "Vàng";
        if (ranking >= 1000) return "Bạc";
        return "Đồng";
    }
}
