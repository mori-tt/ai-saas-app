import { NextResponse } from "next/server";
import { Webhook } from "svix";
import Stripe from "stripe";
import { stripe } from "@/config/stripe";
import { SubscriptionService } from "./subscription-service";
import { WebhookEvent, DeletedObjectJSON } from "@clerk/nextjs/server";
import { UserService } from "./user-service";
import { prisma } from "@/lib/prisma";

// Stripe APIのカスタム型定義
interface StripeSubscriptionWithTimestamps {
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end?: boolean;
}

// Clerkイベントデータ型定義
interface ClerkUserEventData {
  id: string;
  email_addresses: Array<{ email_address: string }>;
}

/**
 * Webhook関連処理を一元管理するサービスクラス
 */
export class WebhookService {
  /**
   * Stripeウェブフックの検証と処理
   */
  static async handleStripeWebhook(
    body: string,
    signature: string | null,
    secret: string
  ): Promise<NextResponse> {
    if (!signature) {
      console.error("Stripeウェブフック: 署名がありません");
      return NextResponse.json({ error: "署名がありません" }, { status: 400 });
    }

    try {
      // イベント検証 - ここではシグネチャ検証は既に行われたものとして処理
      const event = stripe.webhooks.constructEvent(body, signature, secret);
      console.log(
        `Stripeウェブフック: イベント検証成功 イベントタイプ=${event.type}`
      );

      // イベントタイプに応じて処理
      switch (event.type) {
        case "checkout.session.completed":
          console.log("Stripeウェブフック: チェックアウト完了イベント処理開始");
          return await this.handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session
          );

        case "customer.subscription.updated":
          console.log(
            "Stripeウェブフック: サブスクリプション更新イベント処理開始"
          );
          return await this.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription
          );

        case "customer.subscription.deleted":
          console.log(
            "Stripeウェブフック: サブスクリプション削除イベント処理開始"
          );
          return await this.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription
          );

        case "customer.subscription.created":
          console.log(
            "Stripeウェブフック: サブスクリプション作成イベント処理開始"
          );
          return await this.handleSubscriptionCreated(
            event.data.object as Stripe.Subscription
          );

        case "invoice.payment_succeeded":
          console.log("Stripeウェブフック: 支払い成功イベント (処理なし)");
          return NextResponse.json(
            { success: true, message: "支払い成功イベントを受信しました" },
            { status: 200 }
          );

        default:
          console.log(
            `Stripeウェブフック: 処理対象外のイベント: ${event.type}`
          );
          return NextResponse.json(
            {
              message: `処理対象外のイベント: ${event.type}`,
            },
            { status: 200 }
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      console.error(`Stripeウェブフック処理エラー: ${message}`, error);
      return NextResponse.json(
        { error: `Webhook処理エラー: ${message}` },
        { status: 400 }
      );
    }
  }

  /**
   * チェックアウト完了イベントの処理
   */
  private static async handleCheckoutCompleted(
    session: Stripe.Checkout.Session
  ): Promise<NextResponse> {
    console.log(
      `チェックアウト完了イベント処理開始: ${new Date().toISOString()}`
    );

    // まずuserIdを確認し、なければclerkIdを使用する
    const userId = session.metadata?.userId;
    const clerkId = session.metadata?.clerkId;

    if (!userId && !clerkId) {
      console.error(
        "チェックアウト完了イベント: userIdとclerkIdの両方がメタデータに見つかりません"
      );
      return NextResponse.json(
        { error: "ユーザー識別情報が見つかりません" },
        { status: 400 }
      );
    }

    if (!session.subscription) {
      console.error(
        "チェックアウト完了イベント: サブスクリプション情報がありません"
      );
      return NextResponse.json(
        { error: "サブスクリプション情報がありません" },
        { status: 400 }
      );
    }

    try {
      const subscriptionId = session.subscription.toString();

      // DBユーザーの取得
      let dbUser;
      if (userId) {
        console.log(`ユーザー情報をIDから取得: UserID=${userId}`);
        dbUser = await prisma.user.findUnique({
          where: { id: userId },
          include: { subscription: true }, // サブスクリプション情報も取得
        });
      } else if (clerkId) {
        console.log(`ユーザー情報をClerkIDから取得: ClerkID=${clerkId}`);
        dbUser = await prisma.user.findUnique({
          where: { clerkId },
          include: { subscription: true }, // サブスクリプション情報も取得
        });
      }

      if (!dbUser) {
        console.error(
          `チェックアウト完了イベント: ユーザーが見つかりません: UserID=${userId}, ClerkID=${clerkId}`
        );
        return NextResponse.json(
          { error: "ユーザーが見つかりません" },
          { status: 404 }
        );
      }

      console.log(
        `サブスクリプション情報取得: SubscriptionID=${subscriptionId}`
      );
      // サブスクリプション情報の取得
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      // Stripeの型定義にcurrent_period_startとcurrent_period_endがないため型アサーションを使用
      const subWithTimestamps = subscription as unknown as Stripe.Subscription &
        StripeSubscriptionWithTimestamps;

      // Stripeのレスポンスの内容をログに出力して構造を確認
      console.log(
        "Stripeサブスクリプション情報:",
        JSON.stringify(
          {
            id: subscription.id,
            status: subscription.status,
            current_period_start: subWithTimestamps.current_period_start,
            current_period_end: subWithTimestamps.current_period_end,
            items: subscription.items.data.map((item) => ({
              id: item.id,
              priceId: item.price?.id,
            })),
          },
          null,
          2
        )
      );

      // 料金プランIDの取得
      const priceId = subscription.items.data[0]?.price?.id;
      if (!priceId) {
        console.error(
          "チェックアウト完了イベント: 料金プランIDが見つかりません"
        );
        return NextResponse.json(
          { error: "料金プランIDが見つかりません" },
          { status: 400 }
        );
      }

      // 期間終了日の取得
      let periodEnd: Date;
      try {
        const timestamp = subWithTimestamps.current_period_end;
        console.log(
          `取得したタイムスタンプ: ${timestamp}, 型: ${typeof timestamp}`
        );

        if (typeof timestamp !== "number" || isNaN(timestamp)) {
          // フォールバックとして1ヶ月後の日付を使用
          periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          console.log(
            `タイムスタンプが無効なため、1ヶ月後の日付を使用: ${periodEnd.toISOString()}`
          );
        } else {
          periodEnd = new Date(timestamp * 1000);
          console.log(
            `期間終了日として使用する日付: ${periodEnd.toISOString()}`
          );
        }
      } catch (error) {
        console.error(
          `期間終了日の設定に失敗しました: ${
            error instanceof Error ? error.message : "不明なエラー"
          }`
        );
        // フォールバックとして1ヶ月後の日付を使用
        periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        console.log(
          `エラー発生時のフォールバック日付: ${periodEnd.toISOString()}`
        );
      }

      // ユーザーのサブスクリプション情報を更新
      console.log(
        `ユーザーサブスクリプション更新開始: ClerkID=${dbUser.clerkId}, PriceID=${priceId}`
      );
      const user = await SubscriptionService.updateUserSubscription(
        dbUser.clerkId,
        priceId,
        subscriptionId,
        periodEnd
      );

      // 既存のサブスクリプションの処理は必要なく、単純に新しいサブスクリプションに更新
      console.log(
        `サブスクリプション更新完了: UserID=${user.id}, Plan=${user.subscriptionStatus}`
      );
      return NextResponse.json(
        {
          success: true,
          userId: user.id,
          subscriptionId,
          plan: user.subscriptionStatus,
        },
        { status: 200 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      console.error(`チェックアウト処理エラー: ${message}`, error);
      return NextResponse.json(
        { error: `チェックアウト処理エラー: ${message}` },
        { status: 500 }
      );
    }
  }

  /**
   * サブスクリプション更新イベントの処理
   */
  private static async handleSubscriptionUpdated(
    subscription: Stripe.Subscription
  ): Promise<NextResponse> {
    const subscriptionId = subscription.id;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    // Stripeの型定義にcurrent_period_startとcurrent_period_endがないため型アサーションを使用
    const subWithTimestamps = subscription as unknown as Stripe.Subscription &
      StripeSubscriptionWithTimestamps;

    // Stripeのレスポンスの内容をログに出力して構造を確認
    console.log(
      "Stripeサブスクリプション更新情報:",
      JSON.stringify(
        {
          id: subscription.id,
          status: subscription.status,
          current_period_start: subWithTimestamps.current_period_start,
          current_period_end: subWithTimestamps.current_period_end,
          cancel_at_period_end: subWithTimestamps.cancel_at_period_end,
          items: subscription.items.data.map((item) => ({
            id: item.id,
            priceId: item.price?.id,
          })),
        },
        null,
        2
      )
    );

    // ユーザーの検索
    const user = await SubscriptionService.findUserBySubscription(
      subscriptionId,
      customerId
    );

    if (!user) {
      console.error(
        `ユーザーが見つかりません: SubscriptionID=${subscriptionId}, CustomerID=${customerId}`
      );
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    try {
      // 料金プランIDの取得
      const priceId = subscription.items.data[0]?.price?.id;
      if (!priceId) {
        console.error(
          `料金プランIDが見つかりません: SubscriptionID=${subscriptionId}`
        );
        return NextResponse.json(
          { error: "料金プランIDが見つかりません" },
          { status: 400 }
        );
      }

      // 期間終了日の取得
      let periodEnd: Date;
      try {
        const timestamp = subWithTimestamps.current_period_end;
        console.log(
          `取得したタイムスタンプ: ${timestamp}, 型: ${typeof timestamp}`
        );

        if (typeof timestamp !== "number" || isNaN(timestamp)) {
          // フォールバックとして1ヶ月後の日付を使用
          periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          console.log(
            `タイムスタンプが無効なため、1ヶ月後の日付を使用: ${periodEnd.toISOString()}`
          );
        } else {
          periodEnd = new Date(timestamp * 1000);
          console.log(
            `期間終了日として使用する日付: ${periodEnd.toISOString()}`
          );
        }
      } catch (error) {
        console.error(
          `期間終了日の設定に失敗しました: ${
            error instanceof Error ? error.message : "不明なエラー"
          }`
        );
        // フォールバックとして1ヶ月後の日付を使用
        periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        console.log(
          `エラー発生時のフォールバック日付: ${periodEnd.toISOString()}`
        );
      }

      // キャンセル状態の確認
      const isCanceled = subWithTimestamps.cancel_at_period_end === true;
      console.log(`サブスクリプションのキャンセル状態: ${isCanceled}`);

      // ユーザーのサブスクリプション情報を更新
      console.log(
        `ユーザーサブスクリプション更新開始: ClerkID=${user.clerkId}, PriceID=${priceId}`
      );

      // キャンセル予定の場合は現在のステータスを維持しながらcanceledAtを設定
      if (isCanceled) {
        console.log(`期間終了時にキャンセル予定のサブスクリプションを更新`);

        // サブスクリプション情報を更新
        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            stripePriceId: priceId,
            stripeCurrentPeriodEnd: periodEnd,
            canceledAt: new Date(), // キャンセル日時を記録
            status: "CANCELED_AT_PERIOD_END", // キャンセル予定状態
          },
        });

        // ユーザー情報は変更せず、現在のプランを維持
        const updatedUser = await prisma.user.findUnique({
          where: { id: user.id },
        });

        console.log(
          `キャンセル予定のサブスクリプション更新完了: UserID=${user.id}, Plan=${updatedUser?.subscriptionStatus}`
        );
        return NextResponse.json(
          {
            success: true,
            userId: user.id,
            plan: updatedUser?.subscriptionStatus,
            canceledAt: new Date(),
          },
          { status: 200 }
        );
      } else {
        // キャンセルされていない通常のサブスクリプション更新
        const updatedUser = await SubscriptionService.updateUserSubscription(
          user.clerkId,
          priceId,
          subscriptionId,
          periodEnd
        );

        console.log(
          `サブスクリプション更新完了: UserID=${updatedUser.id}, Plan=${updatedUser.subscriptionStatus}`
        );
        return NextResponse.json(
          {
            success: true,
            userId: updatedUser.id,
            plan: updatedUser.subscriptionStatus,
          },
          { status: 200 }
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      console.error(`サブスクリプション更新エラー: ${message}`, error);
      return NextResponse.json(
        { error: `サブスクリプション更新エラー: ${message}` },
        { status: 500 }
      );
    }
  }

  /**
   * サブスクリプション削除イベントの処理
   * 期限切れやキャンセル完了時に呼ばれる
   */
  private static async handleSubscriptionDeleted(
    subscription: Stripe.Subscription
  ): Promise<NextResponse> {
    const subscriptionId = subscription.id;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    console.log(
      `サブスクリプション削除イベント処理: SubscriptionID=${subscriptionId}, CustomerID=${customerId}`
    );

    try {
      // ユーザーの検索
      const user = await SubscriptionService.findUserBySubscription(
        subscriptionId,
        customerId
      );

      if (!user) {
        console.log(
          `対応するユーザーが見つかりません: SubscriptionID=${subscriptionId}`
        );
        return NextResponse.json(
          { message: "対応するユーザーが見つかりません" },
          { status: 200 }
        );
      }

      // DBでサブスクリプションを探す
      const dbSubscription = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!dbSubscription) {
        console.log(
          `DBにサブスクリプションが見つかりません: SubscriptionID=${subscriptionId}`
        );
        return NextResponse.json(
          { message: "DBにサブスクリプションが見つかりません" },
          { status: 200 }
        );
      }

      // サブスクリプションをFREEプランに戻し、必要に応じてクレジットをリセット
      await prisma.$transaction(async (tx) => {
        // サブスクリプション情報を更新
        await tx.subscription.update({
          where: { id: dbSubscription.id },
          data: {
            status: "EXPIRED",
            canceledAt: new Date(),
          },
        });

        // ユーザー情報を更新
        await tx.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: "FREE",
            credits: 5, // 無料プランのクレジット数にリセット
          },
        });
      });

      console.log(
        `サブスクリプション削除処理完了: UserID=${user.id}, 無料プランに変更されました`
      );
      return NextResponse.json(
        {
          success: true,
          message: "サブスクリプションが終了し、無料プランに戻されました",
          userId: user.id,
        },
        { status: 200 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      console.error(`サブスクリプション削除処理エラー: ${message}`, error);
      return NextResponse.json(
        { error: `サブスクリプション削除処理エラー: ${message}` },
        { status: 500 }
      );
    }
  }

  /**
   * サブスクリプション作成イベントの処理
   */
  private static async handleSubscriptionCreated(
    subscription: Stripe.Subscription
  ): Promise<NextResponse> {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    // ユーザーの検索
    const user = await SubscriptionService.findUserBySubscription(
      subscription.id,
      customerId
    );

    if (!user) {
      console.log(
        `サブスクリプション作成: 対応するユーザーが見つかりません: SubscriptionID=${subscription.id}, CustomerID=${customerId}`
      );
      return NextResponse.json(
        { message: "対応するユーザーが見つかりません" },
        { status: 200 }
      );
    }

    console.log(`サブスクリプション作成イベント処理完了: UserID=${user.id}`);
    return NextResponse.json(
      {
        success: true,
        message: "サブスクリプション作成イベントを処理しました",
        userId: user.id,
      },
      { status: 200 }
    );
  }

  /**
   * Clerkウェブフックの検証と処理
   */
  static async handleClerkWebhook(
    body: string,
    headers: Record<string, string | null>,
    secret: string
  ): Promise<NextResponse> {
    try {
      // ヘッダーの確認
      const svix_id = headers["svix-id"];
      const svix_timestamp = headers["svix-timestamp"];
      const svix_signature = headers["svix-signature"];

      if (!svix_id || !svix_timestamp || !svix_signature) {
        return NextResponse.json(
          { error: "必要なヘッダーがありません" },
          { status: 400 }
        );
      }

      // イベント検証
      const wh = new Webhook(secret);
      const evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;

      // イベントタイプに応じて処理
      switch (evt.type) {
        case "user.created":
          return await this.handleUserCreated(evt.data as ClerkUserEventData);

        case "user.updated":
          return await this.handleUserUpdated(evt.data as ClerkUserEventData);

        case "user.deleted":
          return await this.handleUserDeleted(evt.data as DeletedObjectJSON);

        default:
          return NextResponse.json(
            {
              message: `処理対象外のイベント: ${evt.type}`,
            },
            { status: 200 }
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      return NextResponse.json(
        { error: `Webhook処理エラー: ${message}` },
        { status: 400 }
      );
    }
  }

  /**
   * ユーザー作成イベントの処理
   */
  private static async handleUserCreated(
    data: ClerkUserEventData
  ): Promise<NextResponse> {
    const { id, email_addresses } = data;
    if (!id || !email_addresses?.[0]?.email_address) {
      return NextResponse.json(
        { error: "必要な情報がありません" },
        { status: 400 }
      );
    }

    try {
      const email = email_addresses[0].email_address;
      const user = await UserService.ensureUserExists(id, email);

      return NextResponse.json(
        { success: true, userId: user.id },
        { status: 201 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      return NextResponse.json(
        { error: `ユーザー作成エラー: ${message}` },
        { status: 500 }
      );
    }
  }

  /**
   * ユーザー更新イベントの処理
   */
  private static async handleUserUpdated(
    data: ClerkUserEventData
  ): Promise<NextResponse> {
    const { id, email_addresses } = data;
    if (!id || !email_addresses?.[0]?.email_address) {
      return NextResponse.json(
        { error: "必要な情報がありません" },
        { status: 400 }
      );
    }

    try {
      const email = email_addresses[0].email_address;
      const user = await UserService.ensureUserExists(id, email);

      return NextResponse.json(
        { success: true, userId: user.id },
        { status: 200 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      return NextResponse.json(
        { error: `ユーザー更新エラー: ${message}` },
        { status: 500 }
      );
    }
  }

  /**
   * ユーザー削除イベントの処理
   */
  private static async handleUserDeleted(
    data: DeletedObjectJSON
  ): Promise<NextResponse> {
    const { id } = data;
    if (!id) {
      return NextResponse.json(
        { error: "ユーザーIDがありません" },
        { status: 400 }
      );
    }

    try {
      const user = await prisma.user.delete({
        where: { clerkId: id },
      });

      return NextResponse.json(
        { success: true, userId: user.id },
        { status: 200 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラー";
      return NextResponse.json(
        { error: `ユーザー削除エラー: ${message}` },
        { status: 500 }
      );
    }
  }
}
