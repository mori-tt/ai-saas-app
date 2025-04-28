import { NavItem } from "@/types/nav";
import {
  Image,
  ImageDown,
  Layers,
  LayoutDashboard,
  Settings,
  CreditCard,
} from "lucide-react";

/**
 * アプリケーション全体のナビゲーション項目
 * 各ツールへのリンクとアイコンを定義
 */
export const navItems: NavItem[] = [
  // メインダッシュボード
  {
    title: "ダッシュボード",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  // 有料機能
  {
    title: "プラン",
    href: "/dashboard/plan",
    icon: CreditCard,
  },
  // 画像関連ツール
  {
    title: "画像生成",
    href: "/dashboard/tools/image-generator",
    icon: Image,
  },
  {
    title: "背景削除",
    href: "/dashboard/tools/remove-bg",
    icon: Layers,
  },
  {
    title: "画像圧縮",
    href: "/dashboard/tools/optimize",
    icon: ImageDown,
  },
  // ユーザー設定
  {
    title: "アカウント設定",
    href: "/dashboard/settings",
    icon: Settings,
  },
];
