# スマホ操作・QRコード・外部公開

## 現在の状態

PCの上部と「設定」に「スマホで開く」を追加しています。
公開後は、QRコードをスマホのカメラで読み取り、同じアカウントでログインすると、PCと同じ単語帳を使えます。

公開テスト版は [https://kotoba-qv50.onrender.com/](https://kotoba-qv50.onrender.com/) です。Renderのデプロイ成功、公開画面、PostgreSQLを含む正常性API、QR用URLを確認しました。
ローカル起動時にはQRコードの代わりに、公開が必要なことを案内します。
実メール認証、ログイン後の保存、実機のカメラ、携帯回線からの同期は引き続き確認が必要です。

## 操作テスト

隔離したテストDBとEdgeの別ブラウザー環境で確認しました。
無料公開向けのPostgreSQL対応を含め、ビルド・Lint・自動テスト238件が成功しています。
スマホ側はタッチ入力を有効にし、スワイプはブラウザーへ実際のタッチイベントを送って検証しています。
HTTPSの検証用URLへの通信はローカルの検証サーバーへ転送しています。インターネット公開の試験ではありません。

| 確認したこと                                                | 結果 |
| ----------------------------------------------------------- | ---- |
| PC画面のQR画像をデコードし、設定した公開トップURLと一致する | 成功 |
| QRを開いた別ブラウザーではログインが必要                    | 成功 |
| スマホでメールログイン・フォルダー階層作成・単語追加        | 成功 |
| 単語編集・検索・未保存の入力を破棄せずに戻る操作の取り消し  | 成功 |
| 一括貼り付け・フォルダー間の単語移動                        | 成功 |
| タッチスワイプと回答ボタンで学習結果を保存                  | 成功 |
| スマホの変更をPCで、PCの変更をスマホで再読み込みして確認    | 成功 |
| 320・390・430pxの縦画面、844pxの横画面で横にはみ出さない    | 成功 |
| 設定画面のQR表示、ログアウト・再ログイン後の復元            | 成功 |
| フォルダー削除の取り消し・確定、別階層の単語の維持          | 成功 |
| QR取得の一時エラー後に再試行、PC専用URLではQRを表示しない   | 成功 |

未確認：実機のカメラによる読み取り、iOS Safari／Android Chromeの実機操作、実際の画面キーボード、携帯回線からの接続、確認リンクを使った実メール認証、Google／LINEの実認証。Resendアカウント本人への実メール配信までは成功しています。

## QRコードの動作

- サーバーで設定した `APP_ORIGIN` のHTTPSトップURLを使います。画面に入力された任意URLやリクエストのHostヘッダーは使いません。
- パスワード、ログイントークン、単語帳の内容、現在開いている単語のURLはQRに含みません。
- QR画像はブラウザー内で生成します。外部のQR生成サービスへURLや個人データを送信しません。
- URLをコピーするボタンもあります。
- PCを含め、公開後は全端末から同じ公開URLを使ってください。ローカルのDBと公開サーバーのDBは自動では同期しません。

実装：[`MobileAccess.tsx`](../src/components/common/MobileAccess.tsx)、[`mobileAccess.ts`](../server/mobileAccess.ts)。

## 公開の構成

このアプリはNode.jsサーバーを使い、保存先はローカルのSQLiteまたは外部のPostgreSQLです。画面だけを静的サイトとして公開しても、ログイン・アカウント保存は動作しません。

```text
PC・スマホ → 同じHTTPS公開URL → Node.jsサーバー → PostgreSQL（Supabase Free）
                                  └→ 確認メールの配信サービス
```

用意したファイル：

- [`Dockerfile`](../Dockerfile)：Node.js 24で画面とサーバーをビルドし、本番用の依存関係だけで起動します。
- [`.dockerignore`](../.dockerignore)：PCのDB、認証情報、検証用ファイルをイメージに含めません。
- [`railway.json`](../railway.json)：Dockerでのビルドと `/api/health` による起動確認を設定します。
- [`render.yaml`](../render.yaml)：無料Webサービスと外部PostgreSQLを使う設定です。有料ディスクや有料DBを作成する定義はありません。

`npm run build` で画面を `dist/`、サーバーを `build/server.mjs` に生成します。
`npm start` は生成済みのサーバーを起動します。サーバーのソースは静的ファイル配信先の外に置きます。
本番では `PORT` が優先され、未指定時は `API_PORT` または3001を使います。
本番の待ち受け先は既定で `0.0.0.0`、開発時は `127.0.0.1` です。

Docker実行環境がこのPCにないため、Dockerイメージそのもののビルドは未検証です。
代わりに生成したサーバーをNode.jsで起動し、画面・正常性API・QR用URL・メール確認設定を確認しました。

## 無料枠を優先する場合：Render + Supabase

2026年9月29日時点で、公開テスト版は **Render Free（アプリ）+ Supabase Free（PostgreSQL）** を使っています。メール配信はResendまたはBrevoのHTTPS APIに対応しています。契約・料金・利用量の条件は変更されるため、作成時にも公式ページで確認してください。

| 担当                 | サービス            | 注意点                                                                                  |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| アプリとHTTPS公開URL | Render Free         | 15分間アクセスがないと休止。次回の表示に約1分かかる。ローカルファイルは再起動等で消える |
| アカウントと単語帳   | Supabase Free       | 無料枠の容量・計算時間・転送量に上限がある                                              |
| 確認メール           | Resend / Brevo Free | 無料枠に送信上限がある。Resendで一般向けに送るには送信ドメインの検証が必要              |

Render自身の無料PostgreSQLは作成30日後に期限切れになるため、継続保存先としてはこの構成に含めていません。公開用の `onrender.com` アドレスには独自ドメインの購入は不要です。ただし、Resendのメール用ドメインを持っていない場合、その取得費用は別途検討が必要です。アプリ全体を永久・無制限に0円で運用できるという意味ではありません。

Render公式は無料インスタンスを本番サービス向けとはしていません。まず個人の学習用として試し、安定稼働や利用者増加が必要になった段階で構成を見直してください。有料プランへの切り替えや利用上限を超える課金は、この作業では行いません。

手順：

1. RenderとSupabaseの無料アカウントを用意します。APIキーや接続文字列を会話に貼り付ける必要はありません。
2. SupabaseでFreeプランのプロジェクトを作り、Session poolerの接続文字列を取得します。本番ではSSL付きの接続URLを設定します。
3. ソースを管理する**非公開リポジトリー**をRenderに接続し、`render.yaml` を使ってBlueprintを作成します。FreeのWebサービス1つだけであることを確認します。`.data` や `.env` はリポジトリーに含めません。
4. `DATABASE_URL` と `DATABASE_PASSWORD` にSupabaseの接続情報を設定します。`REQUIRE_POSTGRES=true` により、設定漏れのまま一時的なSQLiteへ保存してしまう起動を拒否します。
5. メール配信はResendの `RESEND_API_KEY` と `MAIL_FROM`、またはBrevoの `BREVO_API_KEY`・`BREVO_FROM_EMAIL`・`BREVO_FROM_NAME` を設定します。これらはRenderの環境変数に保存します。資料からAI生成も使う場合は、`GEMINI_API_KEY` と[AI生成の設定](ai-generation.md)にある利用上限を設定します。
6. Renderが発行する `RENDER_EXTERNAL_URL` を公開URLとして自動採用します。独自ドメインへ変えるときだけ `APP_ORIGIN` を明示します。
7. デプロイ後、PC・スマホとも発行された公開URLからアクセスします。QRを実機で読み取り、携帯回線でも保存・復元を確認します。

Render・Supabase・Resendへの実接続と外部公開は実施済みです。Resendのテスト用送信元からアカウント本人への配信成功と、別の宛先が制限で拒否されることを確認しました。ローカルSQLiteをSupabaseへ自動移行する処理は実施していません。

PostgreSQLの実装は、PGliteをTCP接続で動かすテスト環境を用いて、Better Authのテーブル作成・登録・アカウント分離・同時保存の競合・再起動後のデータ維持・ログアウトを確認しました。Supabaseの実サービスへTLS接続し、Renderの正常性APIが成功することも確認済みです。

参考：[Renderの無料枠と制約](https://render.com/docs/free)、[Supabaseの料金](https://supabase.com/pricing)、[Resendの料金](https://resend.com/pricing)、[Brevoの料金](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)、[RenderのBlueprint設定](https://render.com/docs/blueprint-spec)、[Better AuthのPostgreSQL対応](https://better-auth.com/docs/adapters/postgresql)。

## 別案：Railwayを使う場合

Railwayは公開先の候補です。アカウントへの接続・サービス作成・課金契約・デプロイはまだ行っていません。
料金は利用量とプランに依存します。[公式料金](https://docs.railway.com/pricing)で確認してください。

1. Railwayを接続し、このプロジェクトをデプロイするサービスを作ります。既存Gitリポジトリーから、またはCLIでソースを送れます。GitHubなどへ公開するときも、`.env` と `.data` は送信しません。
2. サービスにVolumeを追加し、マウント先を `/data` にします。`DATABASE_PATH=/data/kotoba.sqlite` を設定します。1つのインスタンスで運用します。
3. サービスのNetworkingで公開ドメインを発行します。その正確なURLを `APP_ORIGIN` に設定します。
4. 下表の環境変数を設定してデプロイします。秘密情報はサービスの環境変数に保存し、会話やソースに貼り付けません。
5. PCで公開URLを開き、「スマホで開く」からQRを表示します。スマホで読み取り、Wi-Fiを切った携帯回線でもログイン・保存できることを確認します。

| 変数                                            | 内容                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                                      | `production`（Dockerfileに設定済み）                             |
| `APP_ORIGIN`                                    | 実際に発行された `https://...` の公開URL                         |
| `BETTER_AUTH_SECRET`                            | 32文字以上のランダムな固定値。再デプロイでも維持                 |
| `DATABASE_PATH`                                 | `/data/kotoba.sqlite`。必ずVolumeを付ける                        |
| `RESEND_API_KEY`                                | Resendのメール送信用APIキー                                      |
| `MAIL_FROM`                                     | Resendで検証したドメインの送信元アドレス                         |
| `GEMINI_API_KEY`                                | 資料からAI生成を有効にする場合のGemini APIキー                   |
| `GEMINI_MODEL`                                  | 既定は無料枠対応の `gemini-3.5-flash-lite`                       |
| `AI_USER_DAILY_LIMIT` / `AI_GLOBAL_DAILY_LIMIT` | UTCの1日あたり生成試行回数。Gemini側の無料枠上限も別途適用       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`     | Googleログインを有効にする場合                                   |
| `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET`         | LINEログインを有効にする場合                                     |
| `TRUSTED_PROXY_CIDRS`                           | 利用するプロキシの接続元を確認して設定。未設定時の制約は下記参照 |

無料ホスティングではSMTP接続が制限される場合があるため、HTTPSによるResend・Brevo配信にも対応しました。
SMTPを使える公開先では従来のSMTP設定を利用できます。SMTP、Resend、Brevoは同時に設定しません。
Resendを使うにはアカウント・APIキー・送信ドメインの検証が必要です。テスト用送信元のままで一般ユーザーへの配信ができるとは限りません。

認証の回数制限には接続元IPを使います。`TRUSTED_PROXY_CIDRS` 未設定時はプロキシ経由の利用者が同じ制限を共有する場合があります。ホスティングのネットワーク構成を確認し、実際の接続元だけを指定してください。無条件に全IPを信頼する設定は使いません。

参考：[RailwayのExpress配備](https://docs.railway.com/guides/express)、[公開ネットワーク](https://docs.railway.com/networking/public-networking)、[Volume](https://docs.railway.com/volumes)、[SMTPの制限](https://docs.railway.com/networking/outbound-networking)、[ResendのメールAPI](https://resend.com/docs/api-reference/emails/send-email)、[BrevoのメールAPI](https://developers.brevo.com/docs/send-a-transactional-email)。

## 既存の単語帳を公開サーバーへ引き継ぐ

新しい空のDBを使うと、以前のローカルアカウントと単語帳は自動では現れません。
まずローカルアプリを停止して `.data` をバックアップします。
SQLiteを継続する公開先では、公開先のアプリも停止した上でDBを永続ディスクへ移せます。
SupabaseなどPostgreSQLを使う場合、SQLiteファイルをそのままコピーすることはできません。元データを保管した上で、アカウントと単語帳の移行を別途行う必要があります。
認証情報を移行する場合は、同じ認証シークレットもサーバーの環境変数へ移し、公開URLで再ログインします。これらは公開ファイル置き場やGitに置かず、管理者用の安全な転送方法を使います。
SMTP／Resend／Brevoによるメール確認を有効にした後は、未確認アカウントに確認メールが届くことも確かめます。
実際のデータ移行はまだ実施していません。

Google・LINEのコールバックURLも公開ドメインに変更します。
詳しいログイン設定は[アカウント機能の説明](account-setup.md)を参照してください。

## 公開後の最終確認

PCのQRを実機で読み取り、同じアカウントでログインします。スマホで単語を1つ保存し、PCで再読み込みして確認します。PC側の変更も逆方向で確認します。
さらにメール確認・パスワード再設定・利用する外部ログインを試し、サーバー再起動後も保存内容が残ることと、バックアップからの復旧手順を確認します。
