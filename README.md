# RSC Classic Reader

`pubs.rsc.org` の論文一覧と論文ページを読みやすく整える、非公式のChrome拡張です。Royal Society of Chemistryとは提携・承認関係にありません。

## 機能

- 号一覧ページで左右のサイドレールを隠し、論文カードをページ幅に合わせます。
- タイトル、著者、書誌情報の右側にVisual Abstractを表示します。
- カードが画面近くに来ると、RSC自身がAbstract表示に使う同一サイト内のリクエストからVisual Abstractだけを取り出し、最初からカード右側に表示します。Abstract本文は開かず、ページが重くならないよう近くのカードから順に読み込みます。画像が遅延読み込み形式（srcset/picture）の場合も画像URLを取得します。
- Abstract本文は自動で開きません。読みたい論文だけ、RSCのボタンから開けます。
- 個別論文ページではAbstractとVisual Abstractが見つかった場合に横並びにします。
- PDFリンクを見つけやすくします。
- 拡張機能のオン／オフ設定のみChrome同期ストレージに保存します。

この拡張はRSCのページ上で表示を整えるだけです。論文本文や閲覧履歴を保存せず、第三者への送信や解析SDKを使いません。Visual Abstractの取得時にはRSC標準の同一サイト内AJAXエンドポイントを使い、返されたHTMLから図を表示します。記事一覧を外部から巡回・収集するスクレイパーではありません。

## インストール

1. ZIPをフォルダへ展開します（展開先フォルダの直下に `manifest.json` が入ります）。
2. Chromeで `chrome://extensions` を開き、デベロッパーモードをオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を選び、`manifest.json` が直接入っている展開先フォルダを指定します。
4. RSCの号一覧ページを再読み込みします。

## 対象ページ

- `https://pubs.rsc.org/SC/issue および https://pubs.rsc.org/.../issue/...`
- `https://pubs.rsc.org/.../article/...`

RSCのページ構造やAbstract取得方法が変わった場合、図の表示やレイアウトが変化することがあります。図のない論文はVisual Abstract欄を作りません。
