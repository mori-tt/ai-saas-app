/**
 * Stripe設定チェックスクリプト
 *
 * このスクリプトは、Stripe APIとWebhook設定を確認するためのものです。
 *
 * 使用方法:
 * 1. .envファイルにStripe関連の環境変数が設定されていることを確認
 * 2. npx ts-node src/scripts/check-stripe-config.ts を実行
 */

import { stripe } from "../config/stripe";

async function checkStripeConfig() {
  try {
    console.log("========== Stripe設定チェック ==========");
    console.log("1. Stripe接続テスト...");

    // Stripe接続テスト
    const balance = await stripe.balance.retrieve();
    console.log("✅ Stripe APIに正常に接続できました");

    // Webhookエンドポイント一覧を取得
    console.log("\n2. Webhook設定の確認...");
    const webhooks = await stripe.webhookEndpoints.list();

    if (webhooks.data.length === 0) {
      console.log("❌ Webhookエンドポイントが設定されていません");
    } else {
      console.log(
        `✅ ${webhooks.data.length}件のWebhookエンドポイントが設定されています`
      );

      webhooks.data.forEach((webhook, index) => {
        console.log(`\n[Webhook ${index + 1}]`);
        console.log(`URL: ${webhook.url}`);
        console.log(`ステータス: ${webhook.status}`);
        console.log(`イベント: ${webhook.enabled_events.join(", ")}`);
        console.log(`シークレット: ${webhook.secret ? "設定済み" : "未設定"}`);

        // Webhookに必要なイベントが含まれているか確認
        const requiredEvents = [
          "checkout.session.completed",
          "customer.subscription.updated",
          "customer.subscription.created",
        ];

        const missingEvents = requiredEvents.filter((event) =>
          webhook.enabled_events.includes("*")
            ? false
            : !webhook.enabled_events.includes(event)
        );

        if (missingEvents.length > 0) {
          console.log(
            `❌ 必要なイベントが不足しています: ${missingEvents.join(", ")}`
          );
        } else {
          console.log("✅ 必要なイベントはすべて設定されています");
        }
      });
    }

    // 環境変数の確認
    console.log("\n3. 環境変数の確認...");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    console.log(
      `STRIPE_WEBHOOK_SECRET: ${webhookSecret ? "設定済み" : "未設定"}`
    );

    if (!webhookSecret) {
      console.log("❌ STRIPE_WEBHOOK_SECRETが設定されていません");
    } else {
      console.log("✅ STRIPE_WEBHOOK_SECRETが設定されています");
      // シークレットの形式チェック（whsec_から始まる）
      if (!webhookSecret.startsWith("whsec_")) {
        console.log(
          "❌ STRIPE_WEBHOOK_SECRETの形式が正しくありません（whsec_から始まる必要があります）"
        );
      } else {
        console.log("✅ STRIPE_WEBHOOK_SECRETの形式は正しいです");
      }
    }

    console.log("\n========== チェック完了 ==========");
  } catch (error) {
    console.error("エラーが発生しました:", error);
  }
}

checkStripeConfig();
