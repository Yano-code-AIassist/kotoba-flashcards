# アカウント機能の起動・設定

メール＋パスワード、Google、LINEによる認証と、利用者ごとのサーバー保存を追加しました。認証にはBetter Auth、サーバーにはExpress、データベースにはSQLiteを使います。

## まずこのPCで使う

Node.js 24を推奨します。プロジェクトフォルダーで実行します。

```powershell
npm ci
npm run dev
```

[アプリを開く](http://127.0.0.1:5173/)。`npm run dev` は画面とAPIを一緒に起動します。「初めての方：アカウントを作成」で、表示名・メールアドレス・10〜128文字のパスワードを登録します。終了はCtrl+Cです。

**メール配信未設定で利用できるのはローカル開発用のメール＋パスワード認証です。この状態では確認メールを送りません。** Google・LINEは設定するまで「準備中」と表示します。SMTP、ResendまたはBrevoを設定すると登録時のメール確認とパスワード再設定が有効になります。

認証情報と単語帳は、初期設定では `.data/kotoba.sqlite` に保存します。`DATABASE_URL` を設定すると外部PostgreSQLへ保存します。開発用の認証シークレットは `.data/auth-secret` に自動生成します。`.data` を削除するとローカルのアカウントやデータが失われるため、保管してください。これらはGit管理対象外です。

証明書エラーが出る環境では、このPowerShellで `$env:NODE_USE_SYSTEM_CA = '1'` を設定して再試行します。証明書検証を無効化する設定は不要です。

## Google・LINEを有効にする

`.env.example` を `.env` にコピーし、各サービスで発行した値を記入します。既存の `.env` がある場合は上書きせず追記してください。`.env` はGit管理対象外です。Secretには `VITE_` を付けず、ブラウザー向けソースにも書きません。設定後は `npm run dev` を再起動します。

### Google

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトとOAuth同意画面を設定します。
2. 「ウェブアプリケーション」用のOAuthクライアントを作成します。
3. 承認済みのリダイレクトURIに `http://127.0.0.1:5173/api/auth/callback/google` を登録します。
4. `.env` に `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を記入します。テスト中は同意画面の公開状態に応じてテストユーザーも設定します。

公開時は `APP_ORIGIN` とリダイレクトURIを同じHTTPSドメインに合わせます。例：`https://your-domain.example/api/auth/callback/google`。参考：[Better AuthのGoogle設定](https://better-auth.com/docs/authentication/google)、[Google公式OAuth手順](https://developers.google.com/identity/protocols/oauth2/web-server)。

### LINE

1. [LINE Developers Console](https://developers.line.biz/console/)で、ウェブアプリ用の **LINE Loginチャネル**を作成します。
2. コールバックURLに `http://127.0.0.1:5173/api/auth/callback/line` を登録します。
3. Basic settingsのOpenID Connectから **メールアドレス取得権限を申請**します。今回の構成は `openid profile email` を使用し、メールアドレスの取得が必要です。ログイン画面に表示名・メールアドレスの利用目的を記載しています。
4. Channel IDを `LINE_CLIENT_ID`、Channel secretを `LINE_CLIENT_SECRET` に記入します。
5. 開発中はチャネルの権限を持つテストユーザーで確認し、一般利用に進めるときはチャネルの公開設定も確認します。

参考：[LINE公式のコールバックURLとメール取得権限](https://developers.line.biz/en/docs/line-login/integrate-line-login/)、[Better AuthのLINE設定](https://better-auth.com/docs/authentication/line)。

**実際のGoogle・LINE認証の完了には、上記のサービス登録と認証情報が必要です。今回の検証では実アカウントの認証は行っていません。** 認証URLの発行・コールバック先・state改ざん拒否は自動テストしています。

## 確認メール・パスワード再設定

SMTPのほか、HTTPS経由のResendとBrevoにも対応しています。Render FreeなどSMTPを使えない公開先では、どちらか一方のHTTPS APIを利用します。Resendの `resend.dev` テスト用送信元はResendアカウント本人にしか送れないため、他の利用者へ送るには検証済みドメインが必要です。独自ドメインなしの動作確認では、Brevoで送信者メールアドレスを確認して次を設定できます。

```dotenv
BREVO_API_KEY=Brevoで発行したAPIキー
BREVO_FROM_EMAIL=Brevoで確認済みの送信者メールアドレス
BREVO_FROM_NAME=Kotoba Flashcards
```

Brevo、Resend、SMTPは同時に設定できません。[公開手順とメール配信設定](mobile-publishing.md)を参照してください。以下はSMTPを使う場合の手順です。

利用するメール配信サービスのSMTP情報を設定します。

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=kotoba <no-reply@your-domain.example>
```

これは記入例です。実際のホスト・ポート・認証方式・送信元は契約サービスの値を使います。465番でTLS接続する場合は `SMTP_SECURE=true` にします。SMTP未設定時は「パスワードを忘れた方」を表示しません。

SMTP設定後の新規登録ではメール内のリンクを開いて登録を完了します。確認前にログインを試すと、確認メールを再送します。パスワード再設定が完了すると以前のログインセッションは失効します。参考：[Better Authのメール認証](https://better-auth.com/docs/concepts/email)。実配信は未検証で、テストではメール送信部分を置き換えて確認・再設定の流れを検証しました。

## 同じ単語帳を別のログイン方法でも使う

最初に利用した方法でログインし、「設定」→「アカウント」→「Googleを連携」または「LINEを連携」を使います。メールアドレスは同じものを使用します。

メールアドレスが同じという理由だけで、ログイン時にアカウントを自動統合しません。別々に作成済みのアカウントのデータを合併する機能はありません。教材だけを移す場合はCSV出力・取込を使います。

## 以前のブラウザーデータを引き継ぐ

以前と同じブラウザー・URLで開き、ログイン後に「設定」→「ブラウザーの単語帳を取り込む」を押します。表示される冊数・単語数と取り込み先メールアドレスを確認します。

取り込めるのは、アカウントにまだデータを保存していない場合だけです。例：最初のログイン直後に取り込むと、以前の単語帳・学習状態・設定・途中の学習を一緒に引き継ぎます。先に設定の保存や単語帳作成を行うと、上書き防止のため一括引き継ぎは使えなくなります。

元の `kotoba:app` データは削除しません。`localhost` と `127.0.0.1` は別のブラウザー保存領域なので、以前使ったURLの領域にデータがあるか確認してください。共有PCでは他の人のデータを取り込まないでください。

## 別のPC・スマートフォンから使う

同じサーバーにアクセスし、同じアカウントでログインすると保存内容を利用できます。今の初期設定はこのPC専用です。別のPCでそれぞれ `npm run dev` を起動するだけでは、別々のデータベースになるため共有されません。

公開する場合は、Node.jsが動作するサーバー・永続ディスクまたは外部PostgreSQL・HTTPSが必要です。静的ファイルだけを配信するホスティングでは認証APIを動かせません。無料枠を優先するRender + Supabaseの構成とQRの手順は[外部公開の説明](mobile-publishing.md)を参照してください。公開テスト版はデプロイ済みで、実メール認証と端末間同期を確認中です。

本番では `APP_ORIGIN=https://実際のドメイン`、32文字以上のランダムな `BETTER_AUTH_SECRET`、SMTP・Resend・Brevoのいずれか一つ、各プロバイダーの本番コールバックURLを設定します。シークレットは例えば `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` で生成し、公開せず環境変数に保存します。

```powershell
npm ci
npm run build
$env:NODE_ENV = 'production'
npm start
```

サーバーはAPIに加えて `dist` の画面も配信します。HTTPSリバースプロキシからAPIポート（`PORT` を優先、既定3001）へ接続してください。`TRUSTED_PROXY_CIDRS` に実際のプロキシの接続元IP/CIDRだけを指定します。同じサーバー上のループバック接続なら `127.0.0.1/32,::1/128` です。外部からの `X-Forwarded-For` はプロキシで上書きし、クライアントIPを正しく渡します。未設定時は接続元IPを使うため、プロキシ経由の全利用者が同じログイン回数制限を共有します。本番は既定で `0.0.0.0` に待ち受け、`API_HOST` で変更できます。`DATABASE_PATH` は再起動や再配置でも残るディスク上のパスにします。

公開後はPC上部の「スマホで開く」からQRを読み取り、スマホでも同じアカウントでログインします。DockerとRailway向けの配置設定は[外部公開の説明](mobile-publishing.md)にまとめています。

SQLiteは単一サーバー構成です。複数サーバーへの水平分散は未対応です。`npm run backup` で整合性検査とSHA-256付きの非共有バックアップを作成できます。共有ZIPとの分離、検証、復元は[安全な共有ZIPとバックアップ](backup-and-sharing.md)を参照してください。

## 保存の動作と検証

利用者IDは認証済みセッションからサーバーが取得します。他人のIDをリクエストで指定してもデータは取得・更新できません。CookieはHttpOnlyで、公開環境ではSecureを付けます。パスワードはBetter Authがハッシュ化して保存します。[認証ライブラリの仕様](https://better-auth.com/docs/authentication/email-password)

保存ごとの番号（revision）を比較し、古い番号からの上書きを拒否します。例えばPCとスマートフォンが同じ単語帳を開き、PCで保存した後にスマートフォンで保存すると、再読み込みを案内します。約30秒ごと・画面へ戻った際に更新を確認します。未保存の入力は自動同期で書き換えません。オフライン編集の自動再送は未対応です。

`npm test` では従来の単語帳テストに加え、実際のHTTPとSQLiteでアカウント分離・未認証拒否・同時保存競合・Origin検証・ログアウト・メール確認・パスワード再設定・再起動後の永続化・OAuth開始を検証します。Google・LINEの実サービスとの認証、実SMTP配信、公開環境での端末間アクセスは、認証情報と公開先の設定後に検証が必要です。
