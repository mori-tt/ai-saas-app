import { SubscriptionStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

interface ProfileSectionProps {
  email: string;
  subscriptionStatus: SubscriptionStatus;
  nextBillingData?: Date;
  isCanceled?: boolean;
}

/**
 * プロフィールと現在のサブスクリプション情報を表示するセクション
 */
export default function ProfileSection({
  email,
  subscriptionStatus,
  nextBillingData,
  isCanceled,
}: ProfileSectionProps) {
  // サブスクリプションバッジのスタイル
  let badgeVariant: "default" | "outline" | "secondary" | "destructive" =
    "outline";

  if (subscriptionStatus === "PRO" || subscriptionStatus === "ENTERPRISE") {
    badgeVariant = "default";
  } else if (subscriptionStatus === "STARTER") {
    badgeVariant = "secondary";
  }

  // サブスクリプション名を日本語で表示
  const subscriptionName = {
    FREE: "無料プラン",
    STARTER: "スタータープラン",
    PRO: "プロプラン",
    ENTERPRISE: "エンタープライズプラン",
  }[subscriptionStatus];

  return (
    <Card>
      <CardHeader>
        <CardTitle>プロフィール情報</CardTitle>
        <CardDescription>
          アカウント情報とサブスクリプションステータス
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm font-medium text-muted-foreground">
            メールアドレス
          </div>
          <div className="mt-1 font-semibold">{email}</div>
        </div>

        <div>
          <div className="text-sm font-medium text-muted-foreground">
            現在のプラン
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={badgeVariant}>{subscriptionName}</Badge>
            {isCanceled && <Badge variant="destructive">キャンセル済み</Badge>}
          </div>
        </div>

        {nextBillingData && (
          <div>
            <div className="text-sm font-medium text-muted-foreground">
              {isCanceled ? "プラン終了日" : "次回更新日"}
            </div>
            <div className="mt-1">
              {formatDate(nextBillingData)}
              {isCanceled && (
                <p className="text-sm text-muted-foreground mt-1">
                  この日以降は自動的に無料プランに戻ります
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
