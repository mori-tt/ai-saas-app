import { NextResponse } from "next/server";
import { WebhookService } from "@/services/webhook-service";
import { stripe } from "@/config/stripe";

/**
 * Stripe Webhookハンドラー
 * 決済・サブスクリプション関連のイベントを処理する
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    console.log(
      `Stripeウェブフックリクエスト受信: ${new Date().toISOString()}`
    );
    console.log(`シグネチャ存在確認: ${!!signature}`);
    console.log(`シークレット存在確認: ${!!endpointSecret}`);

    if (!endpointSecret) {
      console.error("STRIPE_WEBHOOK_SECRET が設定されていません");
      return new NextResponse("Webhook secret is not configured", {
        status: 500,
      });
    }

    if (!signature) {
      console.error("Stripeウェブフック: シグネチャが見つかりません");
      return new NextResponse("Signature is missing", {
        status: 400,
      });
    }

    // シグネチャ検証を直接試みる
    try {
      console.log("Stripeウェブフック: シグネチャ検証を試みます");
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        endpointSecret
      );
      console.log(`Stripeウェブフック: イベントタイプ=${event.type}`);

      // WebhookServiceに処理を委譲
      console.log("Stripeウェブフック: イベント処理を開始します");
      return WebhookService.handleStripeWebhook(
        body,
        signature,
        endpointSecret
      );
    } catch (verifyError) {
      const verifyMessage =
        verifyError instanceof Error ? verifyError.message : "不明なエラー";
      console.error(`Stripeシグネチャ検証エラー: ${verifyMessage}`);
      return new NextResponse(
        `Webhook signature verification failed: ${verifyMessage}`,
        {
          status: 400,
        }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    console.error(`Stripeウェブフックエラー: ${message}`, error);
    return new NextResponse(`Internal server error: ${message}`, {
      status: 500,
    });
  }
}
