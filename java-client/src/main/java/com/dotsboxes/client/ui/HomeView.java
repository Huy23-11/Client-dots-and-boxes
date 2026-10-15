package com.dotsboxes.client.ui;

import com.dotsboxes.client.model.UserProfile;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.Slider;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import java.util.prefs.Preferences;

public final class HomeView extends BorderPane {
    private final UserProfile user;
    private final Runnable onQuickMatch;
    private final Runnable onCancelMatch;
    private final Label matchingStatus = new Label();
    private final Button quickButton = new Button("CHƠI NHANH");
    private boolean matching;

    public HomeView(
            UserProfile user,
            Runnable onQuickMatch,
            Runnable onCancelMatch,
            Runnable onLogout
    ) {
        this.user = user;
        this.onQuickMatch = onQuickMatch;
        this.onCancelMatch = onCancelMatch;
        getStyleClass().add("screen");

        setTop(buildHeader(onLogout));
        setLeft(buildSidebar());
        setCenter(buildCenter());
        setRight(buildAvailability());
    }

    private HBox buildHeader(Runnable onLogout) {
        Label avatar = new Label(initials(user.displayName()));
        avatar.getStyleClass().add("avatar");
        Label username = new Label(user.username());
        username.getStyleClass().add("header-name");
        Label rank = new Label(user.rankTier() + "  •  " + user.ranking() + " RP");
        rank.getStyleClass().add("rank-label");
        VBox identity = new VBox(2, username, rank);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button profile = ghostButton("Hồ sơ");
        profile.setOnAction(event -> showProfile());
        Button rules = ghostButton("Luật chơi");
        rules.setOnAction(event -> showRules());
        Button settings = ghostButton("Cài đặt");
        settings.setOnAction(event -> showSettings());
        Button logout = dangerButton("Đăng xuất");
        logout.setOnAction(event -> onLogout.run());

        HBox header = new HBox(
                12, avatar, identity, spacer, profile, rules, settings, logout
        );
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(14, 20, 14, 20));
        header.getStyleClass().add("top-bar");
        return header;
    }

    private VBox buildSidebar() {
        Label title = sectionTitle("KÍCH THƯỚC BÀN");
        Button selected = new Button("3×3  •  9 ô  •  ~5 phút");
        selected.getStyleClass().addAll("size-option", "selected");
        Button four = new Button("4×4  •  Chưa được server hỗ trợ");
        Button five = new Button("5×5  •  Chưa được server hỗ trợ");
        four.getStyleClass().add("size-option");
        five.getStyleClass().add("size-option");
        four.setDisable(true);
        five.setDisable(true);

        Label scope = sectionTitle("PHẠM VI HIỆN TẠI");
        Label note = new Label(
                "Xếp hạng và lịch sử đã có trong database nhưng server chưa cung cấp opcode để tải."
        );
        note.setWrapText(true);
        note.getStyleClass().add("muted");

        VBox sidebar = new VBox(12, title, selected, four, five, scope, note);
        sidebar.setPrefWidth(260);
        sidebar.setPadding(new Insets(24));
        sidebar.getStyleClass().add("side-panel");
        return sidebar;
    }

    private VBox buildCenter() {
        Label kicker = new Label("JAVA NIO • TCP • SERVER AUTHORITATIVE");
        kicker.getStyleClass().add("eyebrow");
        Label title = new Label("DOTS & BOXES");
        title.getStyleClass().add("home-title");
        Label subtitle = new Label("Nối cạnh, chiếm ô và vượt qua đối thủ của bạn.");
        subtitle.getStyleClass().add("muted");

        quickButton.getStyleClass().add("primary-button");
        quickButton.setPrefWidth(300);
        quickButton.setPrefHeight(54);
        quickButton.setOnAction(event -> {
            if (matching) {
                onCancelMatch.run();
            } else {
                onQuickMatch.run();
            }
        });

        Button customRoom = new Button("TẠO PHÒNG RIÊNG");
        customRoom.getStyleClass().add("secondary-button");
        customRoom.setPrefWidth(300);
        customRoom.setDisable(true);

        matchingStatus.getStyleClass().add("match-status");
        matchingStatus.setWrapText(true);

        VBox center = new VBox(18, kicker, title, subtitle, quickButton, customRoom, matchingStatus);
        center.setAlignment(Pos.CENTER);
        center.setPadding(new Insets(40));
        return center;
    }

    private VBox buildAvailability() {
        Label title = sectionTitle("TRẠNG THÁI SERVER");
        Label online = new Label("●  " + user.displayName());
        online.getStyleClass().add("online-label");
        Label status = new Label("Sẵn sàng chơi");
        status.getStyleClass().add("muted");

        Label unavailable = sectionTitle("SẮP CÓ");
        Label list = new Label(
                "Danh sách online\nBảng xếp hạng\nLịch sử trận\nMời người chơi\nPhòng riêng"
        );
        list.getStyleClass().add("muted");
        list.setLineSpacing(8);

        VBox panel = new VBox(10, title, online, status, unavailable, list);
        panel.setPrefWidth(230);
        panel.setPadding(new Insets(24));
        panel.getStyleClass().add("side-panel");
        return panel;
    }

    public void setMatching(boolean matching, String message) {
        this.matching = matching;
        matchingStatus.setText(message);
        quickButton.setText(matching ? "HỦY TÌM TRẬN" : "CHƠI NHANH");
        quickButton.getStyleClass().removeAll("primary-button", "danger-button");
        quickButton.getStyleClass().add(matching ? "danger-button" : "primary-button");
    }

    private void showProfile() {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.setTitle("Hồ sơ người chơi");
        alert.setHeaderText(user.displayName());
        alert.setContentText(
                "Tên đăng nhập: " + user.username()
                        + "\nXếp hạng: " + user.ranking() + " RP"
                        + "\nBậc: " + user.rankTier()
                        + "\nTrạng thái: " + user.status()
        );
        alert.showAndWait();
    }

    private void showRules() {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.setTitle("Luật Dots & Boxes");
        alert.setHeaderText("Nối cạnh và chiếm nhiều ô hơn đối thủ");
        alert.setContentText(
                "Mỗi lượt chọn một cạnh giữa hai chấm kề nhau.\n"
                        + "Hoàn thành cạnh thứ tư của một ô để ghi điểm và được đi tiếp.\n"
                        + "Server xác thực mọi nước đi, tính điểm và quyết định người thắng."
        );
        alert.showAndWait();
    }

    private void showSettings() {
        Preferences preferences = Preferences.userNodeForPackage(HomeView.class);
        Slider volume = new Slider(0, 100, preferences.getDouble("volume", 70));
        volume.setShowTickLabels(true);
        CheckBox notifications = new CheckBox("Bật thông báo trong ứng dụng");
        notifications.setSelected(preferences.getBoolean("notifications", true));

        VBox content = new VBox(
                12,
                new Label("Âm lượng hiệu ứng"),
                volume,
                notifications,
                new Label("Các cài đặt này chỉ được lưu trên máy client.")
        );
        content.setPadding(new Insets(8));

        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Cài đặt");
        dialog.setHeaderText("Tùy chỉnh trải nghiệm");
        dialog.getDialogPane().setContent(content);
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.CANCEL, ButtonType.OK);
        dialog.showAndWait().filter(ButtonType.OK::equals).ifPresent(button -> {
            preferences.putDouble("volume", volume.getValue());
            preferences.putBoolean("notifications", notifications.isSelected());
        });
    }

    private static Label sectionTitle(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("section-title");
        return label;
    }

    private static Button ghostButton(String text) {
        Button button = new Button(text);
        button.getStyleClass().add("ghost-button");
        return button;
    }

    private static Button dangerButton(String text) {
        Button button = new Button(text);
        button.getStyleClass().add("danger-button");
        return button;
    }

    private static String initials(String value) {
        String[] words = value.strip().split("\\s+");
        if (words.length == 1) {
            return words[0].substring(0, Math.min(2, words[0].length())).toUpperCase();
        }
        return (words[0].substring(0, 1) + words[words.length - 1].substring(0, 1))
                .toUpperCase();
    }
}
