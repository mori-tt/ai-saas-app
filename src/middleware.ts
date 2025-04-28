import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// 公開ルートの設定（認証不要）
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/(.*)",
  "/api/webhook/stripe(.*)", // Stripeウェブフックは常に公開
  // Stripe決済後のリダイレクトを公開ルートとして扱う
  "/dashboard\\?(.*)success=true(.*)",
  "/dashboard\\?(.*)canceled=true(.*)",
  "/dashboard\\?(.*)session_preserved=true(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Stripe関連のクエリパラメータがある場合、ログ出力する
  const url = new URL(req.url);
  const hasStripeParams =
    url.searchParams.has("success") ||
    url.searchParams.has("canceled") ||
    url.searchParams.has("session_id") ||
    url.searchParams.has("session_preserved");

  if (hasStripeParams) {
    console.log("Stripe関連パラメータを検出: セッション維持を強化");
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
