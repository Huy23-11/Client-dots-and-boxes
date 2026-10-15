package com.dotsboxes.client.ui;

import java.util.function.Consumer;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

public final class AuthView extends BorderPane {
    public record LoginData(String username, String password) {
    }

    public record RegisterData(String username, String displayName, String password) {
    }

    private final VBox loginForm = new VBox(14);
    private final VBox registerForm = new VBox(14);
    private final Label status = new Label("Đang kết nối tới server...");

    public AuthView(Consumer<LoginData> onLogin, Consumer<RegisterData> onRegister) {
        getStyleClass().add("screen");

        VBox card = new VBox(22);
        card.getStyleClass().add("auth-card");
        card.setMaxWidth(430);
        card.setPadding(new Insets(34));

        Label eyebrow = new Label("TRÒ CHƠI CHIẾN THUẬT ĐỐI KHÁNG");
        eyebrow.getStyleClass().add("eyebrow");
        Label title = new Label("DOTS & BOXES");
        title.getStyleClass().add("hero-title");
        Label subtitle = new Label("Kết nối trực tiếp với Java NIO server");
        subtitle.getStyleClass().add("muted");

        Button loginTab = new Button("ĐĂNG NHẬP");
        Button registerTab = new Button("ĐĂNG KÝ");
        loginTab.getStyleClass().addAll("tab-button", "active");
        registerTab.getStyleClass().add("tab-button");
        HBox tabs = new HBox(8, loginTab, registerTab);
        tabs.setAlignment(Pos.CENTER);

        buildLoginForm(onLogin);
        buildRegisterForm(onRegister);
        registerForm.setVisible(false);
        registerForm.setManaged(false);

        loginTab.setOnAction(event -> {
            loginForm.setVisible(true);
            loginForm.setManaged(true);
            registerForm.setVisible(false);
            registerForm.setManaged(false);
            loginTab.getStyleClass().add("active");
            registerTab.getStyleClass().remove("active");
            clearMessage();
        });
        registerTab.setOnAction(event -> {
            registerForm.setVisible(true);
            registerForm.setManaged(true);
            loginForm.setVisible(false);
            loginForm.setManaged(false);
            registerTab.getStyleClass().add("active");
            loginTab.getStyleClass().remove("active");
            clearMessage();
        });

        status.getStyleClass().add("status-label");
        status.setWrapText(true);
        card.getChildren().addAll(
                eyebrow, title, subtitle, tabs, loginForm, registerForm, status
        );

        StackPane center = new StackPane(card);
        center.setPadding(new Insets(36));
        setCenter(center);
    }

    private void buildLoginForm(Consumer<LoginData> onLogin) {
        TextField username = input("Tên đăng nhập");
        PasswordField password = passwordInput("Mật khẩu");
        Button submit = primaryButton("ĐĂNG NHẬP");
        submit.setMaxWidth(Double.MAX_VALUE);
        submit.setOnAction(event -> {
            if (username.getText().isBlank() || password.getText().isBlank()) {
                showError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
                return;
            }
            showInfo("Đang xác thực...");
            onLogin.accept(new LoginData(username.getText(), password.getText()));
        });
        password.setOnAction(event -> submit.fire());
        loginForm.getChildren().addAll(field("TÊN ĐĂNG NHẬP", username),
                field("MẬT KHẨU", password), submit);
    }

    private void buildRegisterForm(Consumer<RegisterData> onRegister) {
        TextField username = input("Tối thiểu 4 ký tự");
        TextField displayName = input("Tên hiển thị");
        PasswordField password = passwordInput("Tối thiểu 6 ký tự");
        PasswordField confirm = passwordInput("Nhập lại mật khẩu");
        Button submit = primaryButton("TẠO TÀI KHOẢN");
        submit.setMaxWidth(Double.MAX_VALUE);
        submit.setOnAction(event -> {
            if (username.getText().length() < 4 || password.getText().length() < 6
                    || displayName.getText().isBlank()) {
                showError("Tên đăng nhập tối thiểu 4 ký tự và mật khẩu tối thiểu 6 ký tự.");
                return;
            }
            if (!password.getText().equals(confirm.getText())) {
                showError("Mật khẩu nhập lại không khớp.");
                return;
            }
            showInfo("Đang tạo tài khoản...");
            onRegister.accept(new RegisterData(
                    username.getText(), displayName.getText(), password.getText()
            ));
        });
        registerForm.getChildren().addAll(
                field("TÊN ĐĂNG NHẬP", username),
                field("TÊN HIỂN THỊ", displayName),
                field("MẬT KHẨU", password),
                field("NHẬP LẠI MẬT KHẨU", confirm),
                submit
        );
    }

    public void showConnected() {
        showSuccess("Đã kết nối server. Bạn có thể đăng nhập.");
    }

    public void showError(String message) {
        status.setText(message);
        status.getStyleClass().removeAll("success", "info");
        status.getStyleClass().add("error");
    }

    public void showSuccess(String message) {
        status.setText(message);
        status.getStyleClass().removeAll("error", "info");
        status.getStyleClass().add("success");
    }

    public void showInfo(String message) {
        status.setText(message);
        status.getStyleClass().removeAll("error", "success");
        status.getStyleClass().add("info");
    }

    private void clearMessage() {
        status.setText("");
        status.getStyleClass().removeAll("error", "success", "info");
    }

    private static VBox field(String labelText, TextField input) {
        Label label = new Label(labelText);
        label.getStyleClass().add("field-label");
        return new VBox(7, label, input);
    }

    private static TextField input(String prompt) {
        TextField input = new TextField();
        input.setPromptText(prompt);
        input.getStyleClass().add("game-input");
        return input;
    }

    private static PasswordField passwordInput(String prompt) {
        PasswordField input = new PasswordField();
        input.setPromptText(prompt);
        input.getStyleClass().add("game-input");
        return input;
    }

    private static Button primaryButton(String text) {
        Button button = new Button(text);
        button.getStyleClass().add("primary-button");
        return button;
    }
}
