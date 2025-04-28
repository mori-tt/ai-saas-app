"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // エラーをログに記録
    console.error("ダッシュボードエラー:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
      <h2 className="text-2xl font-bold">
        ダッシュボードの読み込み中に問題が発生しました
      </h2>
      <p className="text-muted-foreground text-center max-w-md">
        ユーザー情報の取得または同期中にエラーが発生しました。少し時間をおいてからやり直してください。
      </p>
      <div className="flex gap-4 mt-4">
        <Button onClick={() => reset()}>再試行</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          ページをリロード
        </Button>
      </div>
    </div>
  );
}
