import PageContainer from "@/components/dashboard/page-container";
import PageHeader from "@/components/dashboard/page-header";
import ProfileSection from "@/components/dashboard/settings/profile-section";
import SubscriptionSettingForm from "@/components/dashboard/settings/subscription-settings-form";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * ユーザー設定ページコンポーネント
 * プロフィールとサブスクリプション設定を表示
 */
const SettingsPage = async () => {
  // 認証済みユーザー取得
  const user = await currentUser();
  if (!user) {
    return redirect("/sign-in");
  }

  try {
    // DBからユーザー情報取得
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id },
      include: { subscription: true },
    });

    // ユーザーがDBに存在しない場合
    if (!dbUser) {
      console.error(
        `設定ページ: DBにユーザーが見つかりません ClerkID=${user.id}`
      );
      return (
        <PageContainer>
          <div className="p-4 text-red-500">
            ユーザー情報の読み込みに失敗しました。ダッシュボードに戻ってください。
          </div>
        </PageContainer>
      );
    }

    // ユーザーのメールアドレス
    const email = user.emailAddresses[0]?.emailAddress || "メールアドレスなし";

    // サブスクリプションがキャンセル済みかどうか確認
    const isCanceled =
      dbUser.subscription?.canceledAt !== null ||
      dbUser.subscription?.status === "CANCELED_AT_PERIOD_END";

    return (
      <PageContainer>
        <PageHeader
          title="アカウント設定"
          description="アカウント情報とサブスクリプション設定の管理"
        />

        {/* プロフィール情報表示 */}
        <div className="max-w-2xl mb-6">
          <ProfileSection
            email={email}
            subscriptionStatus={dbUser.subscriptionStatus}
            nextBillingData={dbUser.subscription?.stripeCurrentPeriodEnd}
            isCanceled={isCanceled}
          />
        </div>

        {/* サブスクリプション管理 */}
        <div className="max-w-2xl">
          <SubscriptionSettingForm user={dbUser} isCanceled={isCanceled} />
        </div>
      </PageContainer>
    );
  } catch (error) {
    console.error("設定ページ読み込みエラー:", error);
    return (
      <PageContainer>
        <div className="p-4 text-red-500">
          エラーが発生しました。しばらく経ってからもう一度お試しください。
        </div>
      </PageContainer>
    );
  }
};

export default SettingsPage;
