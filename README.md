# 管理画面（admin-dashboard）

[`docs/01_アーキテクチャ.md`](docs/01_アーキテクチャ.md) を参照。

## 技術スタック

- **Next.js 16**（App Router）/ **React 19**
- **next-auth 5.0.0-beta.31**（Credentials プロバイダ + JWT セッション）
- **mongoose 9**（MongoDB。管理画面自身のDBと care 側DBへの2接続を持つ）
- **firebase-admin 13**（FCM V1 プッシュ通知）
- **Tailwind CSS 4** / Radix UI / recharts（グラフ）
- **Zod 4**（バリデーション）/ TypeScript 5
- **otplib + qrcode**（2FA）/ bcryptjs（パスワードハッシュ）/ nodemailer（メール送信）
- パッケージマネージャ: **pnpm**

## ローカルセットアップ

```bash
pnpm install
cp env.example .env
# .env を開いて必要な値を埋める（詳細は docs/02_環境変数リファレンス.md）
pnpm dev
```

`http://localhost:3000/admin` を開く。**basePath が `/admin` なので、ルート（`/`）ではない点に注意。**

初回は管理者アカウントが1件も無いため、ログイン前に投入スクリプトを実行する。
このスクリプトは Next.js の外で動く単体スクリプトのため `.env` を自動で読み込まない。
`ADMIN_MONGODB_URI` をシェルの環境変数として別途 export する必要がある。

```bash
export ADMIN_MONGODB_URI="（.env の ADMIN_MONGODB_URI と同じ値）"
pnpm tsx scripts/seed-admin.ts
```

作成されるのは固定の `admin@example.com` / `ChangeMe123!`。**ログイン後すぐにパスワードを変更すること**
（別のメールアドレスにしたい場合は `scripts/seed-admin.ts` 内の `email` / `password` を書き換えてから実行する）。

## 主要ディレクトリ

| ディレクトリ | 内容 |
|---|---|
| `app/(auth)/` | ログイン画面・ログイン用 Server Action |
| `app/(dashboard)/` | 認証後の管理画面本体（顧客管理・広告・問い合わせ・LP・ポイント・メルマガ・売上・通知・分析・設定など） |
| `app/api/` | 上記画面が呼ぶ API Route（REST）。`app/api/public/` のみ認証不要 |
| `components/{ui,layout,features}/` | 汎用UI部品 / レイアウト（サイドバー等） / 画面固有コンポーネント |
| `lib/` | DB接続（`db.ts`）・オンライン判定（`presence.ts`）・FCM送信（`firebase-admin.ts`）・広告連携（`ad-sync.ts`）など |
| `models/` | Mongoose スキーマ13本（管理画面自身のDB用と care 側DBの読み取り専用ミラーが混在。内訳は `docs/01_アーキテクチャ.md`） |
| `scripts/` | `seed-admin.ts`（初期管理者アカウント投入） |

## ドキュメント

詳細は `docs/` 以下を参照（[目次](docs/README.md)）。

- [`docs/01_アーキテクチャ.md`](docs/01_アーキテクチャ.md) — 2リポジトリ構成・DB接続・オンライン判定・NextAuth v5の落とし穴
- [`docs/02_環境変数リファレンス.md`](docs/02_環境変数リファレンス.md) — 全環境変数の用途・必須/任意・未設定時の挙動
- [`docs/03_本番反映手順.md`](docs/03_本番反映手順.md) — 本番サーバーへのデプロイ手順
- [`docs/04_既知の課題と残タスク.md`](docs/04_既知の課題と残タスク.md) — 未解決事項と優先度
