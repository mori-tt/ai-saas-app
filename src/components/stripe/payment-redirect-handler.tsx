"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

/**
 * Stripe決済後のリダイレクト処理を行うコンポーネント
 * 認証状態を維持しながらダッシュボードに戻ります
 */
export default function PaymentRedirectHandler() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");
  const sessionPreserved = searchParams.get("session_preserved");

  useEffect(() => {
    // Stripeからのリダイレクトでsession_preservedパラメータがある場合
    if (sessionPreserved && isLoaded) {
      console.log("Stripe決済後のリダイレクト処理を実行中");

      if (!isSignedIn) {
        console.log("認証が失われています、ログインページにリダイレクト");
        // 認証が失われている場合はログインページにリダイレクト
        router.push(
          "/sign-in?redirect_url=" + encodeURIComponent("/dashboard")
        );
        return;
      }

      // 認証状態が維持されている場合、クエリパラメータを整理して再リダイレクト
      console.log("認証状態維持: クエリパラメータを整理");
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("session_preserved");

      // 必要なパラメータのみ保持
      const newParams = new URLSearchParams();
      if (success) newParams.set("success", success);
      if (canceled) newParams.set("canceled", canceled);

      const newPath =
        "/dashboard" + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newPath);
    }
  }, [isLoaded, isSignedIn, router, success, canceled, sessionPreserved]);

  // このコンポーネントは表示しない
  return null;
}
