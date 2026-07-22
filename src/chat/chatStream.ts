import type { TextStreamReader } from 'livekit-client';
import { MAX_CHAT_MESSAGE_BYTES } from './chatConstants';
import { isIncomingChatStreamTooLarge, utf8ByteLength } from './chatValidation';

async function abandonTextStream(reader: TextStreamReader): Promise<void> {
  const controller = new AbortController();
  controller.abort();
  try {
    await reader.readAll({ signal: controller.signal });
  } catch {
    // Ignore cancellation / teardown errors.
  }
}

/**
 * Read a house-chat Text Stream with a hard UTF-8 byte budget.
 * Returns null when the stream is too large or fails — never throws for chat use.
 */
export async function readBoundedHouseChatText(
  reader: TextStreamReader,
): Promise<string | null> {
  try {
    const declaredSize = reader.info.size;
    if (isIncomingChatStreamTooLarge(declaredSize)) {
      await abandonTextStream(reader);
      return null;
    }

    if (typeof declaredSize === 'number' && Number.isFinite(declaredSize)) {
      const text = await reader.readAll();
      if (utf8ByteLength(text) > MAX_CHAT_MESSAGE_BYTES) {
        return null;
      }
      return text;
    }

    // Unknown size: accumulate chunks and abort once over budget.
    const controller = new AbortController();
    let text = '';
    try {
      for await (const chunk of reader.withAbortSignal(controller.signal)) {
        text += chunk;
        if (utf8ByteLength(text) > MAX_CHAT_MESSAGE_BYTES) {
          controller.abort();
          return null;
        }
      }
    } catch {
      if (controller.signal.aborted) return null;
      return null;
    }

    if (utf8ByteLength(text) > MAX_CHAT_MESSAGE_BYTES) {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}
