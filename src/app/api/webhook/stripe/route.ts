import { STRIPE_PLANS } from "@/config/plans";
import { stripe } from "@/config/stripe";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import Stripe from "stripe";

// Stripe関連の型定義
interface StripeSubscription {
  id: string;
  items: {
    data: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
  created: number;
}

// 型ガード関数
function hasCurrentPeriodEnd(subscription: object): boolean {
  return (
    "current_period_end" in subscription &&
    typeof Reflect.get(subscription, "current_period_end") === "number"
  );
}

function getCurrentPeriodEnd(subscription: object): number {
  if (hasCurrentPeriodEnd(subscription)) {
    return Reflect.get(subscription, "current_period_end") as number;
  }
  // フォールバック: 現在時刻から30日後
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

// Stripe APIからサブスクリプション情報を取得する関数
async function fetchSubscription(
  subscriptionId: string
): Promise<StripeSubscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return {
    id: subscription.id,
    items: {
      data: subscription.items.data.map((item) => ({
        price: item.price ? { id: item.price.id } : {},
      })),
    },
    created:
      typeof subscription.created === "number"
        ? subscription.created
        : Math.floor(Date.now() / 1000),
  };
}

export async function POST(request: Request) {
  let event: Stripe.Event | undefined;
  const body = await request.text();
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    // Signature検証
    if (endpointSecret) {
      const signature = request.headers.get("stripe-signature");
      if (!signature) {
        console.error("署名がありません");
        return new NextResponse("Webhook signature missing", { status: 400 });
      }

      try {
        event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
      } catch (error) {
        const message = error instanceof Error ? error.message : "不明なエラー";
        console.error(`署名検証に失敗しました: ${message}`);
        return new NextResponse("Webhook signature verification failed", {
          status: 400,
        });
      }
    } else {
      try {
        event = JSON.parse(body) as Stripe.Event;
      } catch {
        console.error("Webhookボディの解析に失敗しました");
        return new NextResponse("Invalid webhook body", { status: 400 });
      }
    }

    if (!event) {
      return new NextResponse("Webhook Event Error", { status: 500 });
    }

    // イベント処理
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`チェックアウトセッションを処理中: ${session.id}`);

        if (!session.metadata?.clerkId || !session.subscription) {
          console.error("メタデータまたはサブスクリプション情報がありません");
          return new NextResponse(
            "Session Error: Missing metadata or subscription",
            { status: 400 }
          );
        }

        try {
          // サブスクリプション情報取得
          const subscriptionId = session.subscription.toString();
          console.log(`サブスクリプション取得中: ${subscriptionId}`);

          const subscriptionData = await fetchSubscription(subscriptionId);
          const rawSubscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );

          // 期間終了日の計算
          const periodEndTimestamp = getCurrentPeriodEnd(rawSubscription);
          const periodEnd = new Date(periodEndTimestamp * 1000);
          console.log(`サブスクリプション終了日: ${periodEnd}`);

          // 料金プランID取得
          const priceItem = subscriptionData.items.data[0];
          if (!priceItem?.price?.id) {
            console.error("料金プランIDが見つかりません");
            return new NextResponse(
              "Invalid subscription data: missing price ID",
              { status: 500 }
            );
          }

          const priceId = priceItem.price.id;
          console.log(`料金プランID: ${priceId}`);

          // サブスクリプションステータス決定
          let subscriptionStatus: SubscriptionStatus;
          let credits = 10; // デフォルトクレジット数

          switch (priceId) {
            case STRIPE_PLANS.STARTER:
              subscriptionStatus = "STARTER";
              credits = 50;
              break;
            case STRIPE_PLANS.PRO:
              subscriptionStatus = "PRO";
              credits = 120;
              break;
            case STRIPE_PLANS.ENTERPRISE:
              subscriptionStatus = "ENTERPRISE";
              credits = 300;
              break;
            default:
              console.warn(`プランID: ${priceId}、FREEに設定します`);
              subscriptionStatus = "FREE";
              credits = 10;
          }
          console.log(
            `選択されたプラン: ${subscriptionStatus}, 設定するクレジット: ${credits}`
          );

          // ユーザー情報更新
          const clerkId = session.metadata.clerkId;
          console.log(
            `ユーザー更新: ClerkID ${clerkId}, ステータス: ${subscriptionStatus}`
          );

          await prisma.user.update({
            where: { clerkId },
            data: {
              subscriptionStatus,
              credits, // クレジットも同時に更新
              subscriptions: {
                upsert: {
                  create: {
                    stripeSubscriptionId: subscriptionData.id,
                    stripePriceId: priceId,
                    stripeCurrentPeriodEnd: periodEnd,
                  },
                  update: {
                    stripePriceId: priceId,
                    stripeCurrentPeriodEnd: periodEnd,
                  },
                },
              },
            },
          });

          console.log(
            `サブスクリプション更新完了: ${subscriptionStatus}, クレジット: ${credits}`
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "不明なエラー";
          console.error(`サブスクリプション処理エラー: ${errorMessage}`);
          return new NextResponse(
            `Subscription processing error: ${errorMessage}`,
            { status: 500 }
          );
        }
        break;
      }

      case "customer.subscription.updated":
        const subscriptionSession = event.data.object as Stripe.Subscription;
        console.log(
          `サブスクリプション更新イベント受信: ${subscriptionSession.id}, ステータス: ${subscriptionSession.status}`
        );
        if (subscriptionSession.status === "active") {
          // ここで直接stripeCustomerIdを使うのではなく、サブスクリプションIDからユーザーを特定する
          console.log(
            `データベースからサブスクリプション情報を検索: ${subscriptionSession.id}`
          );
          const subscription = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscriptionSession.id },
            include: { user: true },
          });

          // DBに存在するサブスクリプションを確認（デバッグ用）
          const allSubscriptions = await prisma.subscription.findMany({
            select: { stripeSubscriptionId: true, userId: true },
          });
          console.log(
            "データベース内のサブスクリプション:",
            JSON.stringify(allSubscriptions)
          );

          if (subscription && subscription.user) {
            console.log(
              `サブスクリプションに関連するユーザーを発見: ${subscription.user.id}`
            );
            let credits = 10;
            switch (subscriptionSession.items.data[0].price.id) {
              case STRIPE_PLANS.STARTER:
                credits = 50;
                break;
              case STRIPE_PLANS.PRO:
                credits = 120;
                break;
              case STRIPE_PLANS.ENTERPRISE:
                credits = 300;
                break;
            }

            await prisma.user.update({
              where: { id: subscription.user.id },
              data: {
                credits: credits,
              },
            });
            console.log(`ユーザーのクレジットを${credits}に更新しました`);
          } else {
            console.error(
              `サブスクリプションID ${subscriptionSession.id} に関連するユーザーが見つかりません。代替手段を試みます。`
            );

            // 代替: stripeCustomerIdを使用してユーザーを検索
            if (typeof subscriptionSession.customer === "string") {
              console.log(
                `顧客ID ${subscriptionSession.customer} でユーザー検索を試みます`
              );
              const user = await prisma.user.findFirst({
                where: { stripeCustomerId: subscriptionSession.customer },
              });

              if (user) {
                console.log(`顧客IDでユーザーを発見: ${user.id}`);
                let credits = 10;
                switch (subscriptionSession.items.data[0].price.id) {
                  case STRIPE_PLANS.STARTER:
                    credits = 50;
                    break;
                  case STRIPE_PLANS.PRO:
                    credits = 120;
                    break;
                  case STRIPE_PLANS.ENTERPRISE:
                    credits = 300;
                    break;
                }

                await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    credits: credits,
                  },
                });
                console.log(
                  `代替手段でユーザーのクレジットを${credits}に更新しました`
                );
              } else {
                console.error(
                  `顧客ID ${subscriptionSession.customer} に一致するユーザーも見つかりませんでした`
                );
              }
            } else {
              console.error(
                `サブスクリプションに有効な顧客IDがありません: ${typeof subscriptionSession.customer}`
              );
            }
          }
        }
        break;

      default:
        console.log(`未対応のイベントタイプ: ${event.type}`);
    }

    return new NextResponse("Webhook processed successfully", { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "不明なエラー";
    console.error(`Webhookハンドラーでのエラー: ${errorMessage}`);
    return new NextResponse(`Webhook error: ${errorMessage}`, { status: 500 });
  }
}
