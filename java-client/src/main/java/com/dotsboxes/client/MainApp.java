package com.dotsboxes.client;

import com.dotsboxes.client.model.MatchInfo;
import com.dotsboxes.client.model.MoveResultMessage;
import com.dotsboxes.client.model.UserProfile;
import com.dotsboxes.client.network.NioGameClient;
import com.dotsboxes.client.protocol.GameProtocol;
import com.dotsboxes.client.ui.AuthView;
import com.dotsboxes.client.ui.GameView;
import com.dotsboxes.client.ui.HomeView;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Stage;

public final class MainApp extends Application implements NioGameClient.Listener {
    private Stage stage;
    private NioGameClient client;
    private GameProtocol protocol;
    private AuthView authView;
    private HomeView homeView;
    private GameView gameView;
    private UserProfile profile;

    @Override
    public void start(Stage stage) {
        this.stage = stage;
        String host = System.getProperty("game.server.host", "localhost");
        int port = Integer.parseInt(System.getProperty("game.server.port", "5000"));

        client = new NioGameClient(host, port, this);
        protocol = new GameProtocol(client);
        authView = new AuthView(
                data -> {
                    protocol.login(data.username(), data.password());
                },
                data -> protocol.register(data.username(), data.password(), data.displayName())
        );

        stage.setTitle("Dots & Boxes");
        stage.setMinWidth(1040);
        stage.setMinHeight(720);
        show(authView);
        stage.show();
        client.connectAsync();
    }

    @Override
    public void onConnected() {
        Platform.runLater(authView::showConnected);
    }

    @Override
    public void onMessage(String opcode, String params) {
        Platform.runLater(() -> handleMessage(opcode, params));
    }

    @Override
    public void onDisconnected(String reason) {
        Platform.runLater(() -> {
            if (authView != null && stage.getScene().getRoot() == authView) {
                authView.showError(reason + ". Hãy khởi động lại ứng dụng để kết nối lại.");
            } else if (gameView != null && stage.getScene().getRoot() == gameView) {
                gameView.showOpponentEvent(reason);
            }
        });
    }

    private void handleMessage(String opcode, String params) {
        try {
            switch (opcode) {
                case "REPLY_LOGIN" -> handleLogin(params);
                case "SET_SESSION_ID" -> {
                    client.setSessionId(Integer.parseInt(params));
                    protocol.getUserDetail();
                }
                case "REPLY_REGISTER" -> handleRegister(params);
                case "RETURN_USER_DETAIL" -> {
                    profile = UserProfile.parse(params);
                    showHome();
                }
                case "REPLY_JOIN_QUICK_MATCH" -> handleJoinQuickMatch(params);
                case "REPLY_CANCEL_QUICK_MATCH" -> handleCancelQuickMatch(params);
                case "MATCH_FOUND" -> startMatch(MatchInfo.parse(params));
                case "MOVE_RESULT" -> {
                    if (gameView != null) {
                        gameView.applyMove(MoveResultMessage.parse(params));
                    }
                }
                case "INVALID_MOVE" -> {
                    if (gameView != null) {
                        gameView.rejectMove(params);
                    }
                }
                case "GAME_OVER" -> {
                    if (gameView != null) {
                        gameView.finish(params);
                    }
                }
                case "OPPONENT_SURRENDER" ->
                        gameView.showOpponentEvent("Đối thủ đã bỏ cuộc.");
                case "OPPONENT_DISCONNECT" ->
                        gameView.showOpponentEvent("Đối thủ đã mất kết nối.");
                case "REPLY_LOGOUT" -> {
                    client.setSessionId(-1);
                    profile = null;
                    show(authView);
                    authView.showSuccess("Đã đăng xuất.");
                }
                case "REPLY_ATTACH", "PONG" -> {
                    // Connection-management messages do not change the current view.
                }
                default -> System.out.println("Unhandled server opcode: " + opcode);
            }
        } catch (RuntimeException exception) {
            System.err.println("Cannot handle " + opcode + ": " + exception.getMessage());
        }
    }

    private void handleLogin(String status) {
        switch (status) {
            case "LOGIN_SUCCESS" -> authView.showInfo("Đăng nhập thành công, đang nhận session...");
            case "UNKNOWN_USERNAME" -> authView.showError("Tên đăng nhập không tồn tại.");
            case "WRONG_PASSWORD" -> authView.showError("Mật khẩu không đúng.");
            case "ACCOUNT_ALREADY_ONLINE" -> authView.showError("Tài khoản đang online ở thiết bị khác.");
            default -> authView.showError("Đăng nhập thất bại: " + status);
        }
    }

    private void handleRegister(String status) {
        switch (status) {
            case "REGISTER_SUCCESS" ->
                    authView.showSuccess("Tạo tài khoản thành công. Bạn có thể đăng nhập.");
            case "USERNAME_EXISTS" -> authView.showError("Tên đăng nhập đã tồn tại.");
            default -> authView.showError("Không thể tạo tài khoản: " + status);
        }
    }

    private void showHome() {
        homeView = new HomeView(
                profile,
                protocol::joinQuickMatch,
                protocol::cancelQuickMatch,
                protocol::logout
        );
        gameView = null;
        show(homeView);
    }

    private void handleJoinQuickMatch(String status) {
        if (homeView == null) return;
        switch (status) {
            case "SUCCESS" ->
                    homeView.setMatching(true, "Đang tìm đối thủ cho bàn 3×3...");
            case "ALREADY_IN_QUEUE" ->
                    homeView.setMatching(true, "Bạn đã ở trong hàng chờ.");
            default ->
                    homeView.setMatching(false, "Không thể tìm trận: " + status);
        }
    }

    private void handleCancelQuickMatch(String status) {
        if (homeView == null) return;
        homeView.setMatching(false, "SUCCESS".equals(status)
                ? "Đã hủy tìm trận."
                : "Bạn không ở trong hàng chờ.");
    }

    private void startMatch(MatchInfo match) {
        homeView.setMatching(false, "");
        gameView = new GameView(
                profile,
                match,
                move -> protocol.makeMove(move.r1(), move.c1(), move.r2(), move.c2()),
                protocol::surrender,
                () -> {
                    protocol.getUserDetail();
                    showHome();
                }
        );
        show(gameView);
    }

    private void show(Parent root) {
        if (stage.getScene() == null) {
            Scene scene = new Scene(root, 1280, 800);
            scene.getStylesheets().add(
                    getClass().getResource("/styles/app.css").toExternalForm()
            );
            stage.setScene(scene);
        } else {
            stage.getScene().setRoot(root);
        }
    }

    @Override
    public void stop() {
        if (client != null) {
            client.close();
        }
    }

    public static void main(String[] args) {
        launch(args);
    }
}
