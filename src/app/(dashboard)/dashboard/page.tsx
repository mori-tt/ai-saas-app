"use client";
import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import PageContainer from "@/components/dashboard/page-container";
import PageHeader from "@/components/dashboard/page-header";

const DashboardPage = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  useEffect(() => {
    // 決済処理の結果に応じて表示するメッセージを設定
    if (success === "true") {
      toast.success("プランのアップグレードが完了しました！");

      // シンプルなクエリパラメータ削除のみ実行
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);
    } else if (canceled === "true") {
      toast.error("決済がキャンセルされました");

      // URLから余分なパラメータを削除
      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);
    }
  }, [success, canceled, router]);

  // コンポーネントがマウントされたら一度リフレッシュ
  useEffect(() => {
    // キャッシュを使わないようにするためのダミーフェッチ
    const refreshDashboard = async () => {
      try {
        // 複数回リトライする（新規ユーザー登録対応のため回数増加）
        const maxRetries = 7; // リトライ回数を増加
        for (let i = 0; i < maxRetries; i++) {
          console.log(
            `ダッシュボード更新リクエスト試行: ${i + 1}/${maxRetries}`
          );

          // 新規ユーザー登録時は処理に時間がかかるため、より長く待機
          const waitTime = Math.min(1000 * Math.pow(1.5, i), 10000); // 指数バックオフ（最大10秒）
          if (i > 0) {
            console.log(`リトライ前に ${waitTime}ms 待機します`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }

          // 非表示のフェッチでキャッシュをバイパス
          const response = await fetch("/api/refresh-cache", {
            method: "POST",
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              "Content-Type": "application/json",
            },
            credentials: "include", // 認証クッキーを必ず含める
          });

          if (response.ok) {
            const data = await response.json();
            console.log(
              "ダッシュボード更新成功:",
              data.plan,
              "プラン,",
              data.credits,
              "クレジット"
            );
            return;
          } else {
            try {
              const errorData = await response.json();
              console.log(
                `ダッシュボード更新失敗 (${response.status}): ${
                  errorData.error || "不明なエラー"
                }`
              );

              // 認証エラーの場合は待機時間を長くする
              if (response.status === 401 && errorData.retryAfter) {
                console.log(
                  `認証エラーのため ${errorData.retryAfter}ms 待機します`
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, errorData.retryAfter)
                );
              } else if (i < maxRetries - 1) {
                // 次のリトライは指数バックオフで決定（上部で計算済み）
                console.log(`通常のエラーリトライのため待機します`);
              } else {
                console.log("最大リトライ回数に達しました。あきらめます。");
              }
            } catch (jsonError) {
              console.error("レスポンス解析エラー:", jsonError);
            }
          }
        }

        console.error("ダッシュボード更新: 最大リトライ回数に達しました");
        throw new Error("ダッシュボードの更新に失敗しました");
      } catch (error) {
        console.error("Dashboard refresh error:", error);
        // エラーを外部に伝播させてエラーバウンダリに捕捉させる
        throw error;
      }
    };

    // 少し遅らせてからリフレッシュを実行（ユーザー作成が完了するまで待機）
    const timeoutId = setTimeout(() => {
      refreshDashboard().catch((err) => {
        console.error("リフレッシュ処理全体の失敗:", err);
        // この時点でエラーバウンダリが捕捉していない場合はリロード
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="ダッシュボード"
        description="AIツールを使って様々なコンテンツを生成できます"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* ここにダッシュボードのコンテンツを追加 */}
      </div>
    </PageContainer>
  );
};

export default DashboardPage;
