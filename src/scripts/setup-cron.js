/**
 * サブスクリプション確認のためのクロンジョブをセットアップするスクリプト
 *
 * 使用方法:
 * 1. このスクリプトを実行するサーバーに crontab がインストールされていることを確認
 * 2. このスクリプトを実行: node src/scripts/setup-cron.js
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// プロジェクトのルートディレクトリを取得
const projectRoot = path.resolve(__dirname, "../..");

// check-subscription-status.ts へのパス
const scriptPath = path.join(
  projectRoot,
  "src/scripts/check-subscription-status.ts"
);

// ts-nodeのインストールを確認
try {
  execSync("which ts-node", { stdio: "ignore" });
  console.log("✅ ts-node が正常にインストールされています");
} catch (error) {
  console.error("❌ ts-node がインストールされていません");
  console.log("npx ts-node を使用します");
}

// 現在のcrontabエントリを取得
let currentCrontab = "";
try {
  currentCrontab = execSync("crontab -l").toString();
} catch (error) {
  // crontabが空の場合はエラーが発生する場合がある
  console.log("現在のcrontabが空か、取得できません。新しく作成します。");
}

// 実行コマンド（ts-nodeがインストールされていない場合はnpxを使用）
const command = `cd ${projectRoot} && npx ts-node ${scriptPath} check-expired`;

// cronエントリ (毎日午前2時に実行)
const cronEntry = `0 2 * * * ${command} >> ${projectRoot}/logs/subscription-check.log 2>&1`;

// 既にエントリが存在するか確認
if (currentCrontab.includes(scriptPath)) {
  console.log("⚠️ 既にcrontabにエントリが存在します。更新します。");

  // 既存のエントリを新しいものに置き換え
  const updatedCrontab = currentCrontab
    .split("\n")
    .filter((line) => !line.includes(scriptPath))
    .concat(cronEntry)
    .join("\n");

  fs.writeFileSync("/tmp/new-crontab", updatedCrontab);
} else {
  // 新しいエントリを追加
  const newCrontab = currentCrontab.trim() + "\n" + cronEntry + "\n";
  fs.writeFileSync("/tmp/new-crontab", newCrontab);
}

// ログディレクトリの作成
const logDir = path.join(projectRoot, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
  console.log("✅ ログディレクトリを作成しました:", logDir);
}

// 新しいcrontabを適用
try {
  execSync("crontab /tmp/new-crontab");
  console.log("✅ crontabを更新しました");
  console.log(`スケジュール: 毎日午前2時に実行`);
  console.log(`コマンド: ${command}`);
  console.log(`ログファイル: ${projectRoot}/logs/subscription-check.log`);
} catch (error) {
  console.error("❌ crontabの更新に失敗しました:", error.message);
}

// 一時ファイルを削除
fs.unlinkSync("/tmp/new-crontab");
