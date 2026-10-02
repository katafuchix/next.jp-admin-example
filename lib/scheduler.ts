import { CloudSchedulerClient } from "@google-cloud/scheduler";
import type { INotification } from "@/models/Notification";

const TIME_ZONE = "Asia/Tokyo";

function getServiceAccount(): { project_id: string; [key: string]: unknown } {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!encoded) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf-8"));
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid Base64-encoded JSON",
    );
  }
}

let client: CloudSchedulerClient | null = null;

function getClient(): CloudSchedulerClient {
  if (client) return client;
  const serviceAccount = getServiceAccount();
  client = new CloudSchedulerClient({
    credentials: serviceAccount as never,
    projectId: serviceAccount.project_id,
  });
  return client;
}

function getLocationPath(): string {
  const location = process.env.GCP_SCHEDULER_LOCATION;
  if (!location) throw new Error("GCP_SCHEDULER_LOCATION is not set");
  const serviceAccount = getServiceAccount();
  return `projects/${serviceAccount.project_id}/locations/${location}`;
}

function getJobPath(jobName: string): string {
  return `${getLocationPath()}/jobs/${jobName}`;
}

export interface CronResult {
  cron: string;
  timeZone: string;
}

/**
 * "once"/"recurring" の配信設定からcron式を生成する。
 * "once" はCloud Schedulerに単発ジョブという概念が無いため、
 * 対象日時の分・時・日・月に固定したcronにする(年1回だけ一致する)。
 * 実際の再発火防止はCloud Functions側での自己削除・冪等ガードで行う。
 */
export function buildCronExpression(
  notification: Pick<INotification, "scheduleType" | "scheduledAt" | "recurrence">,
): CronResult {
  if (notification.scheduleType === "once") {
    if (!notification.scheduledAt) {
      throw new Error("scheduledAt is required for scheduleType=once");
    }
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      minute: "numeric",
      hour: "numeric",
      day: "numeric",
      month: "numeric",
      hourCycle: "h23",
    }).formatToParts(notification.scheduledAt);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const minute = get("minute");
    const hour = get("hour");
    const day = get("day");
    const month = get("month");
    if (!minute || !hour || !day || !month) {
      throw new Error("Failed to derive cron fields from scheduledAt");
    }
    return { cron: `${minute} ${hour} ${day} ${month} *`, timeZone: TIME_ZONE };
  }

  if (notification.scheduleType === "recurring") {
    const recurrence = notification.recurrence;
    if (!recurrence?.daysOfWeek?.length || !recurrence.time) {
      throw new Error("recurrence.daysOfWeek and recurrence.time are required for scheduleType=recurring");
    }
    const [hour, minute] = recurrence.time.split(":");
    if (!hour || !minute) {
      throw new Error(`Invalid recurrence.time: "${recurrence.time}"`);
    }
    const days = [...recurrence.daysOfWeek].sort((a, b) => a - b).join(",");
    return { cron: `${minute} ${hour} * * ${days}`, timeZone: TIME_ZONE };
  }

  throw new Error(`buildCronExpression is not applicable for scheduleType="${notification.scheduleType}"`);
}

/**
 * 通知の現在の状態(enabled/schedulerJobName/cron)とGCP上のジョブを一致させる。
 * べき等: 作成・更新どちらから呼んでも同じ結果になる。
 * 戻り値は呼び出し側でMongoに保存すべき差分。
 */
export async function syncSchedulerJob(
  notification: Pick<
    INotification,
    "scheduleType" | "scheduledAt" | "recurrence" | "enabled" | "schedulerJobName"
  > & { id: string },
): Promise<{ schedulerJobName?: string; cronExpression?: string }> {
  if (notification.scheduleType === "immediate") {
    return {};
  }

  const baseUrl = process.env.NOTIFICATION_DISPATCH_BASE_URL;
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  if (!baseUrl || !secret) {
    throw new Error(
      "NOTIFICATION_DISPATCH_BASE_URL / NOTIFICATION_DISPATCH_SECRET is not set",
    );
  }

  const schedulerClient = getClient();
  const jobName = notification.schedulerJobName ?? `notif-${notification.id}`;
  const jobPath = getJobPath(jobName);

  if (!notification.enabled) {
    if (notification.schedulerJobName) {
      await schedulerClient.pauseJob({ name: jobPath }).catch((err: unknown) => {
        // ジョブが既に存在しない/一時停止済みの場合は無視する
        if (!isNotFoundOrAlreadyDone(err)) throw err;
      });
    }
    return { schedulerJobName: notification.schedulerJobName };
  }

  const { cron, timeZone } = buildCronExpression(notification);

  const dispatchUri = `${baseUrl.replace(/\/$/, "")}/api/notifications/dispatch/${notification.id}`;

  if (!notification.schedulerJobName) {
    const [job] = await schedulerClient.createJob({
      parent: getLocationPath(),
      job: {
        name: jobPath,
        schedule: cron,
        timeZone,
        httpTarget: {
          uri: dispatchUri,
          httpMethod: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: Buffer.from(JSON.stringify({ notificationId: notification.id })),
        },
      },
    });
    return { schedulerJobName: job.name ?? jobPath, cronExpression: cron };
  }

  await schedulerClient.updateJob({
    job: { name: jobPath, schedule: cron, timeZone },
    updateMask: { paths: ["schedule", "time_zone"] },
  });
  await schedulerClient.resumeJob({ name: jobPath }).catch((err: unknown) => {
    if (!isNotFoundOrAlreadyDone(err)) throw err;
  });
  return { schedulerJobName: jobPath, cronExpression: cron };
}

export async function deleteSchedulerJob(schedulerJobName: string): Promise<void> {
  const schedulerClient = getClient();
  await schedulerClient.deleteJob({ name: schedulerJobName }).catch((err: unknown) => {
    if (!isNotFoundOrAlreadyDone(err)) throw err;
  });
}

function isNotFoundOrAlreadyDone(err: unknown): boolean {
  const code = (err as { code?: number } | undefined)?.code;
  return code === 5; // google.rpc.Code.NOT_FOUND
}
