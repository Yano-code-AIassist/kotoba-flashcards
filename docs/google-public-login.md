# 公開版のGoogleログイン設定

対象アプリ：[kotoba公開テスト版](https://kotoba-qv50.onrender.com/)。
2026年10月1日にGoogleとBetter Authの公式手順、アプリの設定処理を確認してまとめています。

進捗更新（2026年11月19日）：Google CloudでOAuthクライアントを作成し、シークレットを保存したとの利用者申告があります。次は「4. Renderへ設定する」です。Renderへの反映とGoogleの実ログインは未確認です。

## 1. プロジェクトを選ぶ

[Google CloudのGoogle Auth Platform](https://console.cloud.google.com/auth/overview)を開きます。
このアプリ用に作成したプロジェクトがあれば選択します。まだなければ「新しいプロジェクト」で名前を `kotoba-flashcards` にして作成します。
個人制作では、学校から管理を任された組織でない限り「組織なし」を使います。学校の管理者による制限が表示された場合は、個人のGoogleアカウントで設定します。

## 2. 同意画面を設定する

「開始」からGoogle Auth Platformの初期設定を進めます。

| 項目 | 設定 |
| --- | --- |
| アプリ名 | `kotoba` |
| ユーザーサポートメール | 自分が受信でき、ログインする利用者に表示してよいメールアドレス |
| 対象 / Audience | 外部 / External |
| デベロッパーの連絡先 | 自分が受信できるメールアドレス |

公開状態は設定確認中のため「テスト」のままにします。
このアプリのGoogle認証が要求する権限は `openid`・`email`・`profile` です。データアクセス画面で選ぶ場合も、この3つだけを使います。

Googleの公式説明では、名前・メール・プロフィールだけを要求するログインは、テストユーザー一覧と7日間の認可期限の例外です。Gmail本文やGoogle Driveの権限を加えると、この例外は適用されません。学校などの管理者によるアクセス制限は別に適用されます。

## 3. OAuthクライアントを作成する

「クライアント」→「クライアントを作成」で次を入力します。

| 項目 | 設定 |
| --- | --- |
| アプリケーションの種類 | ウェブアプリケーション |
| 名前 | `kotoba-render` |
| 承認済みのJavaScript生成元 | `https://kotoba-qv50.onrender.com` |
| 承認済みのリダイレクトURI | `https://kotoba-qv50.onrender.com/api/auth/callback/google` |

リダイレクトURIは文字を変えずに登録します。末尾の `/` は付けません。認証の成功後、Googleがアプリへ戻す宛先です。

作成後のクライアントIDとクライアントシークレットを保管します。シークレットは作成時だけ表示されるため、その画面からRenderへコピーします。チャットやGitHubへ貼り付けません。

## 4. Renderへ設定する

[RenderのEnvironment画面](https://dashboard.render.com/web/srv-datcoh2d0e5s73bj02rg/env)で「Edit」を押し、次の2項目を追加します。

| Key | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Cloudで発行したクライアントID |
| `GOOGLE_CLIENT_SECRET` | Google Cloudで発行したクライアントシークレット |

両方を設定して保存・再デプロイします。起動時にGoogle設定を読み込むため、環境変数を保存しただけで再デプロイしない場合は反映されません。
アプリの本番URLにはRenderの `RENDER_EXTERNAL_URL` を使っています。

## 5. 確認する

1. [公開設定API](https://kotoba-qv50.onrender.com/api/config)で `"google":true` を確認します。
2. 通常のChrome・Edge・Safariなどで公開アプリを開き、「Googleでログイン」を押します。
3. Googleの同意画面で、要求される情報が名前・メール・プロフィールであることを確認します。
4. ログイン後に単語を保存して再読み込みします。
5. PCの「スマホで開く」からQRを読み取り、同じGoogleアカウントでスマホへログインします。スマホの更新をPCで再読み込みして確認します。

Googleログインは確認メール配信とは別の認証方法です。Resendのテスト送信元による宛先制限は解消されないため、別のアドレスでメール登録する場合の送信設定は引き続き必要です。
すでに同じメールアドレスでメール登録したアカウントがある場合、アプリはGoogleアカウントを自動統合しません。連携エラーが出たら元のログイン方法で認証し、設定画面からGoogleを連携します。

## 情報源

- [Google：ウェブアプリのOAuthクライアントとリダイレクトURI](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google：Audienceと基本プロフィールだけを使う場合の例外](https://support.google.com/cloud/answer/15549945?hl=ja)
- [Better Auth：Googleの設定](https://better-auth.com/docs/authentication/google)
- アプリ実装：`server/config.ts`、`server/backend.ts`、`src/components/auth/LoginPage.tsx`
