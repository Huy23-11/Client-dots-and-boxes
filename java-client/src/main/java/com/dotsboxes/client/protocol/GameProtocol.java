package com.dotsboxes.client.protocol;

import com.dotsboxes.client.network.NioGameClient;

public final class GameProtocol {
    private final NioGameClient client;

    public GameProtocol(NioGameClient client) {
        this.client = client;
    }

    public void login(String username, String password) {
        client.send("LOGIN,," + safe(username) + ";" + safe(password));
    }

    public void register(String username, String password, String displayName) {
        client.send("REGISTER,,"
                + safe(username) + ";" + safe(password) + ";" + safe(displayName));
    }

    public void getUserDetail() {
        client.send("GET_USER_DETAIL,,");
    }

    public void joinQuickMatch() {
        client.send("JOIN_QUICK_MATCH,,");
    }

    public void cancelQuickMatch() {
        client.send("CANCEL_QUICK_MATCH,,");
    }

    public void makeMove(int r1, int c1, int r2, int c2) {
        client.send("MAKE_MOVE,," + r1 + ";" + c1 + ";" + r2 + ";" + c2);
    }

    public void surrender() {
        client.send("SURRENDER,,");
    }

    public void logout() {
        client.send("LOGOUT,," + client.getSessionId());
    }

    private static String safe(String value) {
        return value.strip().replace(";", "").replace(",,", "");
    }
}
