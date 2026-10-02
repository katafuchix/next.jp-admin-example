import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Newsletter from "@/models/Newsletter";
import Subscriber from "@/models/Subscriber";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

// bccに大量の宛先を一度に詰め込むとSMTPプロバイダの1通あたりの上限に
// 引っかかったりスパム判定されやすくなるため、この件数ごとに分けて送信する
const BATCH_SIZE = Number(process.env.SMTP_BATCH_SIZE ?? 50);

async function sendEmail(
  subject: string,
  _body: string,
  recipients: string[],
): Promise<{ sent: number; error: string | null }> {
  const host = process.env.SMTP_HOST;
  if (!host) return { sent: 0, error: "SMTP not configured" };

  let sent = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require("nodemailer") as typeof import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? "noreply@example.com",
        bcc: batch,
        subject,
        html: _body,
      });
      sent += batch.length;
    }

    return { sent, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    // 途中のバッチまでは送信済みなので、成功件数はsentとして残す
    return { sent, error: message };
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return forbidden;

  try {
    await connectDB();
    const { id } = await params;

    const newsletter = await Newsletter.findById(id);
    if (!newsletter) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    if (newsletter.status === "sent") {
      return NextResponse.json(
        { success: false, error: "Newsletter has already been sent." },
        { status: 400 },
      );
    }

    // SMTP未設定時はここで failed にし、成功したように見せない。
    const SMTP_HOST = process.env.SMTP_HOST;
    if (!SMTP_HOST) {
      await Newsletter.findByIdAndUpdate(id, { status: "failed" });
      return NextResponse.json(
        { success: false, error: "SMTP_HOST が未設定のため送信できません" },
        { status: 503 },
      );
    }

    const subscriberDocs = await Subscriber.find({ isSubscribed: true })
      .select("email")
      .lean();
    const actualRecipients = subscriberDocs.map((s) => s.email as string);
    const result = await sendEmail(
      newsletter.subject,
      newsletter.body,
      actualRecipients,
    );

    if (result.error) {
      await Newsletter.findByIdAndUpdate(id, { status: "failed" });
      return NextResponse.json(
        { success: false, error: `SMTP send failed: ${result.error}` },
        { status: 500 },
      );
    }

    await Newsletter.findByIdAndUpdate(id, {
      status: "sent",
      sentAt: new Date(),
      totalRecipients: result.sent,
    });

    return NextResponse.json({
      success: true,
      message: `Newsletter sent successfully via SMTP to ${result.sent} recipients.`,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
