package com.dotsboxes.client.network;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.channels.SocketChannel;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public final class NioGameClient implements AutoCloseable {
    public interface Listener {
        void onConnected();

        void onMessage(String opcode, String params);

        void onDisconnected(String reason);
    }

    private static final Duration PING_AFTER = Duration.ofSeconds(5);
    private static final Duration LOST_AFTER = Duration.ofSeconds(15);

    private final String host;
    private final int port;
    private final Listener listener;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "dots-network-reader");
        thread.setDaemon(true);
        return thread;
    });
    private final ScheduledExecutorService heartbeatExecutor =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread thread = new Thread(r, "dots-heartbeat");
                thread.setDaemon(true);
                return thread;
            });
    private final AtomicBoolean connected = new AtomicBoolean();
    private final AtomicBoolean disconnectNotified = new AtomicBoolean();
    private final AtomicInteger messageId = new AtomicInteger();
    private final Object writeLock = new Object();

    private volatile SocketChannel channel;
    private volatile int sessionId = -1;
    private volatile long lastReceivedAt;
    private volatile boolean closing;

    public NioGameClient(String host, int port, Listener listener) {
        this.host = host;
        this.port = port;
        this.listener = listener;
    }

    public void connectAsync() {
        networkExecutor.execute(() -> {
            try {
                SocketChannel newChannel = SocketChannel.open();
                newChannel.configureBlocking(true);
                newChannel.connect(new InetSocketAddress(host, port));
                channel = newChannel;
                lastReceivedAt = System.currentTimeMillis();
                disconnectNotified.set(false);
                connected.set(true);
                listener.onConnected();
                startHeartbeat();
                readLoop();
            } catch (IOException exception) {
                notifyDisconnected("Không thể kết nối " + host + ":" + port);
            }
        });
    }

    public void send(String rawMessage) {
        SocketChannel activeChannel = channel;
        if (!connected.get() || activeChannel == null) {
            listener.onDisconnected("Chưa kết nối tới server");
            return;
        }

        synchronized (writeLock) {
            try {
                List<ByteBuffer> frames =
                        FrameCodec.encode(rawMessage, sessionId, messageId.getAndIncrement());
                for (ByteBuffer frame : frames) {
                    while (frame.hasRemaining()) {
                        activeChannel.write(frame);
                    }
                }
            } catch (IOException exception) {
                notifyDisconnected("Mất kết nối khi gửi dữ liệu");
            }
        }
    }

    public int getSessionId() {
        return sessionId;
    }

    public void setSessionId(int sessionId) {
        this.sessionId = sessionId;
    }

    private void readLoop() {
        try {
            while (connected.get()) {
                String rawMessage = FrameCodec.readMessage(channel, sessionId);
                lastReceivedAt = System.currentTimeMillis();
                int separator = rawMessage.indexOf(",,");
                if (separator < 0) {
                    continue;
                }
                listener.onMessage(
                        rawMessage.substring(0, separator),
                        rawMessage.substring(separator + 2)
                );
            }
        } catch (IOException exception) {
            if (!closing) {
                notifyDisconnected("Kết nối tới server đã bị đóng");
            }
        }
    }

    private void startHeartbeat() {
        heartbeatExecutor.scheduleAtFixedRate(() -> {
            if (!connected.get()) {
                return;
            }
            long idle = System.currentTimeMillis() - lastReceivedAt;
            if (idle >= LOST_AFTER.toMillis()) {
                notifyDisconnected("Server không phản hồi");
            } else if (idle >= PING_AFTER.toMillis()) {
                send("PING,,");
            }
        }, 5, 5, TimeUnit.SECONDS);
    }

    private void notifyDisconnected(String reason) {
        if (!disconnectNotified.compareAndSet(false, true)) {
            return;
        }
        connected.set(false);
        closeChannel();
        listener.onDisconnected(reason);
    }

    private void closeChannel() {
        SocketChannel activeChannel = channel;
        channel = null;
        if (activeChannel != null) {
            try {
                activeChannel.close();
            } catch (IOException ignored) {
                // Connection is already unusable.
            }
        }
    }

    @Override
    public void close() {
        closing = true;
        connected.set(false);
        closeChannel();
        heartbeatExecutor.shutdownNow();
        networkExecutor.shutdownNow();
    }
}
