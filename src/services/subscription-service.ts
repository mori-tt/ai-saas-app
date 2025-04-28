import { stripe } from "@/config/stripe";
import { prisma } from "@/lib/prisma";
import { STRIPE_PLANS } from "@/config/plans";
import { SubscriptionStatus, User } from "@prisma/client";

/**
 * サブスクリプション関連の処理を一元管理するサービスクラス
 */
export class SubscriptionService {
  /**
   * プランIDからサブスクリプションステータスとクレジット数を取得
   */
  static getPlanDetails(priceId: string): {
    status: SubscriptionStatus;
    credits: number;
  } {
    switch (priceId) {
      case STRIPE_PLANS.STARTER:
        return { status: "STARTER", credits: 50 };
      case STRIPE_PLANS.PRO:
        return { status: "PRO", credits: 120 };
      case STRIPE_PLANS.ENTERPRISE:
        return { status: "ENTERPRISE", credits: 300 };
      default:
        return { status: "FREE", credits: 10 };
    }
  }

  /**
   * Stripeチェックアウトセッションの作成
   * @param priceId Stripe料金プランID
   * @param userId ユーザーID
   * @param email ユーザーメールアドレス
   * @param existingCustomerId 既存のStripeカスタマーID (オプション)
   */
  static async createCheckoutSession(
    priceId: string,
    userId: string,
    email: string,
    existingCustomerId?: string | null
  ): Promise<string> {
    try {
      // StripeカスタマーIDの確認・作成
      let customerId = existingCustomerId;

      if (!customerId) {
        // 新規Stripeカスタマーの作成
        console.log(`Stripeカスタマー作成: UserID=${userId}, Email=${email}`);
        const customer = await stripe.customers.create({
          email: email,
          metadata: { userId: userId },
        });

        // ユーザー情報の更新
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customer.id },
        });

        customerId = customer.id;
        console.log(`Stripeカスタマー作成完了: CustomerID=${customerId}`);
      }

      // 既存のアクティブなサブスクリプションを確認
      const existingSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });

      // 既存のアクティブなサブスクリプションIDを取得
      const existingSubscriptionIds = existingSubscriptions.data
        .map((sub) => sub.id)
        .join(",");

      console.log(
        `チェックアウトセッション作成: PriceID=${priceId}, CustomerID=${customerId}`
      );

      if (existingSubscriptionIds) {
        console.log(
          `既存のアクティブなサブスクリプションが見つかりました: ${existingSubscriptionIds}`
        );
      }

      // メタデータを準備
      const metadata: Record<string, string> = { userId };

      // 既存サブスクリプションがあればメタデータに追加
      if (existingSubscriptionIds) {
        metadata.previous_subscription_ids = existingSubscriptionIds;
      }

      // チェックアウトセッションの作成
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        payment_method_types: ["card"],
        billing_address_collection: "auto",
        success_url: `${process.env.BASE_URL}/dashboard?success=true&session_preserved=true`,
        cancel_url: `${process.env.BASE_URL}/dashboard?canceled=true&session_preserved=true`,
        metadata,
      });

      if (!session.url) {
        throw new Error("セッションURLの作成に失敗しました");
      }

      console.log(`チェックアウトセッション作成完了: SessionID=${session.id}`);
      return session.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      console.error(`チェックアウトセッション作成エラー: ${message}`, error);
      throw error;
    }
  }

  /**
   * サブスクリプション情報に基づくユーザー更新
   */
  static async updateUserSubscription(
    clerkId: string,
    priceId: string,
    subscriptionId: string,
    periodEnd: Date
  ): Promise<User> {
    try {
      console.log(
        `サブスクリプション更新開始: ClerkID=${clerkId}, SubscriptionID=${subscriptionId}, PriceID=${priceId}`
      );
      console.log(`期間終了日: ${periodEnd.toISOString()}`);

      // 日付が有効かチェック
      if (!(periodEnd instanceof Date) || isNaN(periodEnd.getTime())) {
        console.error(`無効な期間終了日です: ${periodEnd}`);
        throw new Error("無効な期間終了日が指定されました");
      }

      const { status, credits } = this.getPlanDetails(priceId);
      console.log(`プラン情報: Status=${status}, Credits=${credits}`);

      // トランザクションでユーザー情報と購読情報を更新
      const updatedUser = await prisma.$transaction(async (tx) => {
        return await tx.user.update({
          where: { clerkId },
          data: {
            subscriptionStatus: status,
            credits,
            subscription: {
              upsert: {
                create: {
                  stripeSubscriptionId: subscriptionId,
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
      });

      console.log(
        `サブスクリプション更新完了: UserID=${updatedUser.id}, Status=${updatedUser.subscriptionStatus}`
      );
      return updatedUser;
    } catch (error) {
      console.error(
        `サブスクリプション更新エラー: ${
          error instanceof Error ? error.message : "不明なエラー"
        }`,
        error
      );
      throw error;
    }
  }

  /**
   * ポータルセッションの作成
   */
  static async createPortalSession(customerId: string): Promise<string> {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.BASE_URL}/dashboard/settings`,
    });

    return session.url;
  }

  /**
   * サブスクリプションIDまたは顧客IDによるユーザー検索
   */
  static async findUserBySubscription(
    subscriptionId: string,
    customerId?: string
  ): Promise<User | null> {
    // サブスクリプションIDで検索
    const subscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: { user: true },
    });

    if (subscription?.user) {
      return subscription.user;
    }

    // 代替: カスタマーIDで検索
    if (customerId) {
      return await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
      });
    }

    return null;
  }
}
