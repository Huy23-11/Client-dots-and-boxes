package com.dotsboxes.client.network;

import java.io.EOFException;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.SocketChannel;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class FrameCodec {
    private static final int MAX_PAYLOAD = 128;
    private static final int FRAME_HEADER_WITHOUT_LENGTH = 12;
    private static final int MAX_ACCEPTED_PAYLOAD = 1_048_576;

    private FrameCodec() {
    }

    static List<ByteBuffer> encode(String rawMessage, int sessionId, int messageId) {
        byte[] bytes = rawMessage.getBytes(StandardCharsets.UTF_8);
        int partCount = Math.max(1, (bytes.length + MAX_PAYLOAD - 1) / MAX_PAYLOAD);
        List<ByteBuffer> frames = new ArrayList<>(partCount);

        for (int part = 0; part < partCount; part++) {
            int start = part * MAX_PAYLOAD;
            int payloadLength = Math.min(MAX_PAYLOAD, bytes.length - start);
            ByteBuffer frame = ByteBuffer.allocate(16 + payloadLength);
            frame.putInt(payloadLength);
            frame.putInt(sessionId);
            frame.putInt(messageId);
            frame.putShort((short) partCount);
            frame.putShort((short) part);
            if (payloadLength > 0) {
                frame.put(bytes, start, payloadLength);
            }
            frame.flip();
            frames.add(frame);
        }
        return frames;
    }

    static String readMessage(SocketChannel channel, int expectedSessionId) throws IOException {
        Frame first = readFrame(channel, expectedSessionId);
        List<Frame> frames = new ArrayList<>(first.partCount());
        frames.add(first);

        for (int i = 1; i < first.partCount(); i++) {
            Frame next = readFrame(channel, expectedSessionId);
            if (next.messageId() != first.messageId()
                    || next.partCount() != first.partCount()
                    || next.partId() != i) {
                throw new IOException("Invalid multi-frame message");
            }
            frames.add(next);
        }

        int totalLength = frames.stream().mapToInt(frame -> frame.payload().length).sum();
        ByteBuffer payload = ByteBuffer.allocate(totalLength);
        frames.forEach(frame -> payload.put(frame.payload()));
        return new String(payload.array(), StandardCharsets.UTF_8);
    }

    private static Frame readFrame(SocketChannel channel, int expectedSessionId) throws IOException {
        ByteBuffer lengthBuffer = ByteBuffer.allocate(4);
        readFully(channel, lengthBuffer);
        lengthBuffer.flip();
        int payloadLength = lengthBuffer.getInt();
        if (payloadLength < 0 || payloadLength > MAX_ACCEPTED_PAYLOAD) {
            throw new IOException("Invalid payload length: " + payloadLength);
        }

        ByteBuffer body = ByteBuffer.allocate(FRAME_HEADER_WITHOUT_LENGTH + payloadLength);
        readFully(channel, body);
        body.flip();

        int sessionId = body.getInt();
        int messageId = body.getInt();
        short partCount = body.getShort();
        short partId = body.getShort();
        byte[] payload = new byte[payloadLength];
        body.get(payload);

        if (expectedSessionId != -1 && sessionId != -1 && sessionId != expectedSessionId) {
            throw new IOException("Response belongs to another session");
        }
        if (partCount < 1 || partId < 0 || partId >= partCount) {
            throw new IOException("Invalid frame part metadata");
        }
        return new Frame(sessionId, messageId, partCount, partId, payload);
    }

    private static void readFully(SocketChannel channel, ByteBuffer buffer) throws IOException {
        while (buffer.hasRemaining()) {
            int read = channel.read(buffer);
            if (read < 0) {
                throw new EOFException("Server closed the connection");
            }
            if (read == 0) {
                Thread.onSpinWait();
            }
        }
    }

    private record Frame(
            int sessionId,
            int messageId,
            short partCount,
            short partId,
            byte[] payload
    ) {
    }
}
