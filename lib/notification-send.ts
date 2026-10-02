import { getFirebaseMessaging } from "@/lib/firebase-admin";

export const SEGMENT_TOPIC_MAP: Record<string, string> = {
  all: "hapiken-all",
  active: "hapiken-active",
  inactive: "hapiken-inactive",
  premium: "hapiken-premium",
};

export async function sendFCMNotification(
  title: string,
  body: string,
  segment: string,
): Promise<{ error: string | null }> {
  const topic = SEGMENT_TOPIC_MAP[segment] ?? "hapiken-all";

  try {
    const messaging = getFirebaseMessaging();
    await messaging.send({
      topic,
      notification: { title, body },
      data: { segment },
    });
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "FCM send failed";
    return { error: message };
  }
}
