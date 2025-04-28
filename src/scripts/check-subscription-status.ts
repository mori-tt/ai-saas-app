/**
 * サブスクリプションステータス確認・修正スクリプト
 *
 * このスクリプトはユーザーのサブスクリプションステータスを確認し、
 * 必要に応じて手動で更新するためのものです。
 */

import { prisma } from "../lib/prisma";
import { stripe } from "../config/stripe";
import { SubscriptionService } from "../services/subscription-service";

// Stripe APIから返される型を定義
interface StripeSubscriptionWithPeriod {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: {
    data: Array<{
      price?: {
        id: string;
        unit_amount?: number;
        currency: string;
      };
    }>;
  };
}

/**
 * 特定ユーザーのサブスクリプションステータスをチェック
 */
async function checkAndFixSubscriptionStatus(clerkId: string) {
  try {
    console.log(`========== サブスクリプション確認: ${clerkId} ==========`);

    // ユーザー情報を取得
    const user = await prisma.user.findUnique({
      where: { clerkId },
      include: { subscription: true },
    });

    if (!user) {
      console.error(`❌ ユーザーが見つかりません: ${clerkId}`);
      return;
    }

    console.log("✅ ユーザー情報:");
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`SubscriptionStatus: ${user.subscriptionStatus}`);
    console.log(`Credits: ${user.credits}`);
    console.log(`StripeCustomerId: ${user.stripeCustomerId || "なし"}`);

    // サブスクリプション情報を表示
    if (user.subscription) {
      console.log("\n✅ DB上のサブスクリプション情報:");
      console.log(`ID: ${user.subscription.id}`);
      console.log(
        `StripeSubscriptionId: ${user.subscription.stripeSubscriptionId}`
      );
      console.log(`StripePriceId: ${user.subscription.stripePriceId}`);
      console.log(
        `現在の期間終了日: ${user.subscription.stripeCurrentPeriodEnd}`
      );
    } else {
      console.log("\n❌ DB上のサブスクリプション情報がありません");
    }

    // Stripeから顧客情報を取得
    if (user.stripeCustomerId) {
      try {
        console.log("\n✅ Stripe上の顧客情報を取得しています...");
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);

        if (customer.deleted) {
          console.log("❌ この顧客はStripe上で削除されています");
        } else {
          console.log(`Stripe顧客ID: ${customer.id}`);
          console.log(`Stripe顧客Email: ${customer.email}`);

          // サブスクリプション一覧を取得
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: "all",
            expand: ["data.default_payment_method"],
          });

          if (subscriptions.data.length === 0) {
            console.log("\n❌ Stripe上のサブスクリプションがありません");
          } else {
            console.log(
              `\n✅ Stripe上のサブスクリプション (${subscriptions.data.length}件):`
            );

            for (const sub of subscriptions.data) {
              // 型アサーションで適切な型に変換
              const stripeSub = sub as unknown as StripeSubscriptionWithPeriod;

              console.log(`\n[Subscription ${stripeSub.id}]`);
              console.log(`ステータス: ${stripeSub.status}`);
              console.log(
                `期間終了日: ${new Date(stripeSub.current_period_end * 1000)}`
              );

              if (stripeSub.items.data.length > 0) {
                const price = stripeSub.items.data[0].price;
                if (price) {
                  console.log(`プランID: ${price.id}`);
                  console.log(
                    `金額: ${price.unit_amount ? price.unit_amount / 100 : 0} ${
                      price.currency
                    }`
                  );
                }
              }

              // DBとの不一致を確認
              if (
                user.subscription &&
                user.subscription.stripeSubscriptionId === stripeSub.id
              ) {
                if (
                  stripeSub.status === "active" &&
                  user.subscriptionStatus !== "PRO"
                ) {
                  console.log(
                    "❌ DB上のステータスが不一致です (アクティブなサブスクリプションですが、PROになっていません)"
                  );
                }

                // 料金プランIDの確認
                const priceId = stripeSub.items.data[0]?.price?.id;
                if (priceId && user.subscription.stripePriceId !== priceId) {
                  console.log(
                    `❌ DB上の料金プランIDが不一致です (DB: ${user.subscription.stripePriceId}, Stripe: ${priceId})`
                  );
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("❌ Stripe顧客情報の取得に失敗しました:", error);
      }
    } else {
      console.log("\n❌ StripeカスタマーIDがありません");
    }

    // 手動更新の確認
    const shouldUpdate = process.argv.includes("--fix");
    if (shouldUpdate && user.stripeCustomerId) {
      console.log("\n🔄 サブスクリプション情報を手動で更新します...");

      try {
        // Stripeからアクティブなサブスクリプションを取得
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: "active",
        });

        if (subscriptions.data.length > 0) {
          // 型アサーションで適切な型に変換
          const activeSub = subscriptions
            .data[0] as unknown as StripeSubscriptionWithPeriod;
          const priceId = activeSub.items.data[0]?.price?.id;

          if (priceId) {
            // 期間終了日の取得
            const periodEnd = new Date(activeSub.current_period_end * 1000);

            // サブスクリプション情報を更新
            const updatedUser =
              await SubscriptionService.updateUserSubscription(
                user.clerkId,
                priceId,
                activeSub.id,
                periodEnd
              );

            console.log("✅ サブスクリプション情報を更新しました");
            console.log(`新しいステータス: ${updatedUser.subscriptionStatus}`);
            console.log(`新しいクレジット: ${updatedUser.credits}`);
          } else {
            console.log("❌ 料金プランIDが見つかりません");
          }
        } else {
          console.log("❌ アクティブなサブスクリプションが見つかりません");
        }
      } catch (error) {
        console.error("❌ サブスクリプション更新に失敗しました:", error);
      }
    } else if (shouldUpdate) {
      console.log("\n❌ StripeカスタマーIDがないため更新できません");
    } else {
      console.log(
        "\n💡 サブスクリプション情報を手動で更新するには、--fixオプションを付けて実行してください"
      );
    }

    console.log("\n========== 確認完了 ==========");
  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 期限切れサブスクリプションの自動チェックと修正
 * クロンジョブとして定期的に実行することを想定
 */
async function checkExpiredSubscriptions() {
  try {
    console.log(
      "========== 期限切れサブスクリプションの自動チェック開始 =========="
    );

    // 現在の日時
    const now = new Date();

    // 現在日時よりも期間終了日が過ぎているサブスクリプションを検索
    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        stripeCurrentPeriodEnd: {
          lt: now,
        },
        // まだEXPIREDになっていないもの
        status: {
          notIn: ["EXPIRED"],
        },
      },
      include: {
        user: true,
      },
    });

    console.log(
      `期限切れの可能性があるサブスクリプション: ${expiredSubscriptions.length}件`
    );

    for (const subscription of expiredSubscriptions) {
      console.log(
        `\n----- サブスクリプションID: ${subscription.stripeSubscriptionId} の確認 -----`
      );

      try {
        // Stripeからサブスクリプション情報を取得
        const stripeSubscription = await stripe.subscriptions
          .retrieve(subscription.stripeSubscriptionId)
          .catch(() => null);

        if (!stripeSubscription) {
          console.log(
            "Stripe上にサブスクリプションが存在しないため、無料プランに戻します"
          );
          await updateToFreeplan(subscription.userId);
          continue;
        }

        // Stripe側のステータスを確認
        if (stripeSubscription.status !== "active") {
          console.log(
            `Stripeステータス: ${stripeSubscription.status} - 無料プランに戻します`
          );
          await updateToFreeplan(subscription.userId);
          continue;
        }

        // 実際には有効期限が延長されているケース（自動更新された場合など）
        const stripeSub =
          stripeSubscription as unknown as StripeSubscriptionWithPeriod;
        const newPeriodEnd = new Date(stripeSub.current_period_end * 1000);

        if (newPeriodEnd > now) {
          console.log("期間が延長されています。DBを更新します");

          // 料金プランIDの取得
          const priceId = stripeSub.items.data[0]?.price?.id;
          if (!priceId) {
            console.log("料金プランIDが見つかりません");
            continue;
          }

          // サブスクリプション情報を更新
          await SubscriptionService.updateUserSubscription(
            subscription.user.clerkId,
            priceId,
            subscription.stripeSubscriptionId,
            newPeriodEnd
          );

          console.log(`期間が更新されました: ${newPeriodEnd.toISOString()}`);
        } else if (stripeSub.cancel_at_period_end) {
          console.log("キャンセル済みかつ期限切れのため、無料プランに戻します");
          await updateToFreeplan(subscription.userId);
        }
      } catch (error) {
        console.error(`サブスクリプション確認中にエラーが発生しました:`, error);
      }
    }

    console.log("\n========== 自動チェック完了 ==========");
  } catch (error) {
    console.error(
      "期限切れサブスクリプションチェック中にエラーが発生しました:",
      error
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * ユーザーを無料プランに戻す
 */
async function updateToFreeplan(userId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      // ユーザー情報を更新
      await tx.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: "FREE",
          credits: 5,
        },
      });

      // サブスクリプション情報を更新
      await tx.subscription.updateMany({
        where: { userId },
        data: {
          status: "EXPIRED",
          canceledAt: new Date(),
        },
      });
    });

    console.log(`ユーザーID ${userId} を無料プランに戻しました`);
    return true;
  } catch (error) {
    console.error(`無料プランへの変更中にエラーが発生しました:`, error);
    return false;
  }
}

// スクリプト実行
const args = process.argv.slice(2);
const command = args[0];

if (command === "check-expired") {
  // 期限切れサブスクリプションのチェック
  checkExpiredSubscriptions();
} else {
  // 特定ユーザーのサブスクリプションチェック
  const clerkId = args[0];
  if (!clerkId) {
    console.error(
      "使用方法: npx ts-node src/scripts/check-subscription-status.ts <CLERK_ID> [--fix]"
    );
    console.error(
      "または: npx ts-node src/scripts/check-subscription-status.ts check-expired"
    );
    process.exit(1);
  }

  checkAndFixSubscriptionStatus(clerkId);
}
