import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { WebhookService } from "@/services/webhook-service";

/**
 * Clerk Webhookハンドラー
 * ユーザーの作成・更新・削除イベントを処理する
 */
export async function POST(req: Request) {
  try {
    // Webhook検証用の設定取得
    const SIGNING_SECRET = process.env.SIGNING_SECRET;
    if (!SIGNING_SECRET) {
      console.error("環境変数SIGNING_SECRETが設定されていません");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    // ヘッダー取得
    const headerPayload = await headers();
    const headerValues: Record<string, string | null> = {
      "svix-id": headerPayload.get("svix-id"),
      "svix-timestamp": headerPayload.get("svix-timestamp"),
      "svix-signature": headerPayload.get("svix-signature"),
    };

    // ボディ取得
    const body = await req.text();

    // WebhookServiceに処理を委譲
    return WebhookService.handleClerkWebhook(
      body,
      headerValues,
      SIGNING_SECRET
    );
  } catch (error) {
    console.error("Webhookハンドラーエラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
