# 安全な共有ZIPとバックアップ

共有するソースコードと、復旧に使う実データを分けて扱います。エクスプローラーでプロジェクトフォルダー全体をZIPにすると、`.data` 内のアカウント・単語帳・認証シークレットや、`.env` 内のAPIキーまで入る可能性があります。共有時は専用コマンドを使ってください。

## 共有用ZIPを作る

プロジェクトフォルダーで実行します。

```powershell
npm run share:zip
```

`.artifacts/kotoba-flashcards-source-日時.zip` とSHA-256ファイルを作成します。このZIPには許可したソース・設定例・説明書だけを入れ、次の内容を除外します。

- `.env`、認証シークレット、秘密鍵、APIキーらしい内容
- `.data`、`.backups`、SQLiteとそのWAL・SHMファイル
- `node_modules`、`dist`、`build`、Git管理情報
- 以前に作ったZIP

作成後にZIPをもう一度読み取り、禁止ファイル、秘密らしい文字列、各ファイルのSHA-256を検証します。検出した場合はZIPを残さず処理を失敗させます。受け取ったZIPは次のコマンドでも再検証できます。

```powershell
npm run share:verify -- ".artifacts\kotoba-flashcards-source-日時.zip"
```

`SHARE-MANIFEST.json` は、ZIP内のファイル一覧とSHA-256を記録します。`.env.example` は値が空の設定例なので共有対象です。実際の値を書き込まないでください。

## SQLiteをバックアップする

CSV出力は教材の問題・答え・補足だけであり、アカウント、フォルダー階層、学習状態、設定、学習途中の位置を復元できません。ローカル版の完全バックアップには次を使います。

```powershell
npm run backup
```

`.backups/kotoba-backup-日時/` に次のファイルを作成します。

| ファイル               | 内容                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| `kotoba.sqlite`        | アカウントと単語帳を含む整合したSQLiteスナップショット                     |
| `auth-secret`          | ローカルで自動生成した認証シークレット。環境変数を使っている場合は含めない |
| `backup-manifest.json` | DBのSHA-256、SQLite整合性検査結果、テーブルごとの件数                      |
| `RESTORE.txt`          | 復元手順と注意事項                                                         |

バックアップはSQLiteの `VACUUM INTO` で作成します。SQLite公式仕様では、元DBを変更せず、元DBと同じ論理内容を持つ一貫したスナップショットを生成します。[SQLite公式：VACUUM INTO](https://www.sqlite.org/lang_vacuum.html#vacuuminto)

次のコマンドで、ファイル破損、DBの整合性、テーブル件数、認証シークレットのハッシュを再検証できます。

```powershell
npm run backup:verify -- ".backups\kotoba-backup-日時"
```

`.backups` はGit・Docker・共有ZIPから除外しています。ただし、バックアップ自体にはメールアドレス、パスワードのハッシュ、学習内容、認証シークレットが含まれます。共有せず、本人だけがアクセスできる別の保存先にもコピーしてください。

## 復元する

1. アプリを停止します。
2. `npm run backup:verify -- "バックアップフォルダー"` を実行します。
3. 現在の `.data` を削除せず、別名で保管します。
4. バックアップの `kotoba.sqlite` を `.data/kotoba.sqlite` へコピーします。
5. `auth-secret` が含まれていれば `.data/auth-secret` へコピーします。外部の `BETTER_AUTH_SECRET` を使っていた場合は、バックアップ作成時と同じ値を安全な環境変数から設定します。
6. アプリを起動し、ログイン、フォルダー階層、単語、学習状態を確認します。

例として、単語「RFP」を覚えた状態でバックアップした場合、復元後も「RFP」の本文だけでなく、所属フォルダーと「覚えた」の状態が戻ることを確認します。復元確認が終わるまで、復元前の`.data`と元バックアップを残してください。

## PostgreSQLを使っている場合

`DATABASE_URL` が設定されている場合、`npm run backup` はSQLiteを誤って保存しないよう停止します。Neonなどの管理画面にある復元機能、またはPostgreSQLの `pg_dump` / `pg_restore` を使います。利用できる保持期間や機能は契約プランで確認してください。認証に使う `BETTER_AUTH_SECRET` はDBバックアップへ入らないため、ホスティングの秘密情報管理またはパスワードマネージャーで別に保管します。
