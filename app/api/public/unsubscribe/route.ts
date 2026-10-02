import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Subscriber from "@/models/Subscriber";

const HTML_SUCCESS = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>購読解除完了</title>
</head>
<body>
  <p>購読解除が完了しました。</p>
</body>
</html>`;

const HTML_NOT_FOUND = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>無効なリンク</title>
</head>
<body>
  <p>無効なリンクです。すでに解除済みか、リンクが正しくありません。</p>
</body>
</html>`;

const HTML_ERROR = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>エラー</title>
</head>
<body>
  <p>エラーが発生しました。しばらくしてから再度お試しください。</p>
</body>
</html>`;

const htmlResponse = (html: string, status: number) =>
  new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return htmlResponse(HTML_NOT_FOUND, 400);
  }

  try {
    await connectDB();

    const subscriber = await Subscriber.findOneAndUpdate(
      { unsubscribeToken: token },
      { $set: { isSubscribed: false, unsubscribedAt: new Date() } },
      { new: true },
    );

    if (!subscriber) {
      return htmlResponse(HTML_NOT_FOUND, 404);
    }

    return htmlResponse(HTML_SUCCESS, 200);
  } catch (err) {
    console.error("[unsubscribe] error:", err);
    return htmlResponse(HTML_ERROR, 500);
  }
}
