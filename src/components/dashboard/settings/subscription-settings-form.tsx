"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STRIPE_PLANS } from "@/config/plans";
import { SubscriptionStatus } from "@prisma/client";

interface SubscriptionSettingFormProps {
  user: {
    id: string;
    clerkId: string;
    email: string;
    stripeCustomerId: string | null;
    credits: number;
    subscriptionStatus: SubscriptionStatus;
  };
  isCanceled?: boolean;
}

/**
 * サブスクリプション設定フォーム
 * プラン変更やキャンセルのためのUI
 */
export default function SubscriptionSettingForm({
  user,
  isCanceled,
}: SubscriptionSettingFormProps) {
  const isFreePlan = user.subscriptionStatus === "FREE";
  const hasBillingPortalAccess = user.stripeCustomerId !== null;

  // プランのアップグレードまたはダウングレード
  const handleUpgrade = async (planId: string) => {
    try {
      // サブスクリプション変更APIを呼び出す
      const response = await fetch("/api/subscription/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ priceId: planId }),
      });

      if (!response.ok) {
        throw new Error("チェックアウトセッションの作成に失敗しました");
      }

      const data = await response.json();
      // ユーザーをStripeチェックアウトページにリダイレクト
      window.location.href = data.url;
    } catch (error) {
      console.error("サブスクリプション変更エラー:", error);
      alert("サブスクリプションの変更に失敗しました。もう一度お試しください。");
    }
  };

  // 請求ポータルを開く
  const openBillingPortal = async () => {
    try {
      // 修正: 正しいAPIエンドポイントのパスに変更
      const response = await fetch("/api/create-portal-session", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("請求ポータルの作成に失敗しました");
      }

      const data = await response.json();
      // ユーザーをStripe請求ポータルにリダイレクト
      window.location.href = data.url;
    } catch (error) {
      console.error("請求ポータル作成エラー:", error);
      alert("請求ポータルの作成に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>サブスクリプション管理</CardTitle>
        <CardDescription>
          サブスクリプションプランの管理と請求情報の確認
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isFreePlan ? (
          <div className="space-y-4">
            <p>
              プランをアップグレードして、より多くの機能やクレジットを利用できます。
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => handleUpgrade(STRIPE_PLANS.STARTER)}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                スタータープランへアップグレード
              </Button>
              <Button
                onClick={() => handleUpgrade(STRIPE_PLANS.PRO)}
                className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
              >
                プロプランへアップグレード
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {isCanceled ? (
              <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
                <div className="flex">
                  <div className="text-yellow-800">
                    <p className="font-medium">
                      サブスクリプションのキャンセルが完了しています
                    </p>
                    <p className="mt-1 text-sm">
                      現在の期間終了後は自動的に無料プランに戻ります。期間終了前に再度サブスクリプションを有効化することもできます。
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p>
                現在{" "}
                <span className="font-semibold">
                  {user.subscriptionStatus === "STARTER"
                    ? "スタータープラン"
                    : user.subscriptionStatus === "PRO"
                    ? "プロプラン"
                    : "エンタープライズプラン"}
                </span>{" "}
                をご利用中です。請求情報の確認やプランの変更は以下から行えます。
              </p>
            )}
            {hasBillingPortalAccess && (
              <Button onClick={openBillingPortal}>
                {isCanceled ? "サブスクリプションを再開" : "請求設定を管理"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        サブスクリプションは{" "}
        <a
          href="https://stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Stripe
        </a>{" "}
        を通じて安全に処理されます
      </CardFooter>
    </Card>
  );
}
