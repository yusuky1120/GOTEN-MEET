# GOTEN MEET

Phaser上で間取り・壁・家具を直接描画する、2D俯瞰型シェアハウスのフロントエンド・プロトタイプです。ローカルでは LiveKit による Presence（全体表示）と Voice（部屋音声）の最小構成を利用できます。

## 現在できること

- キッチン、廊下、リビング、作業部屋、玄関を表示
- WASDまたは矢印キーによるアバター移動
- 壁・家具との衝突判定
- 現在いる部屋名の表示
- カメラによるアバター追従
- 固定 Presence Room による全ユーザーの座標同期（別の音声部屋でもマップに表示）
- マップ部屋に連動する Voice Room でのマイク音声
- 同じ Voice Room 内での距離に応じた受信音量減衰
- participant identity に応じた服色（肌・髪・目は元色のまま）

マップ上の表示名（例: リビング）と LiveKit Voice room 名（例: `living-room`）は分離しています。「マップの部屋と音声を連動する」を ON にすると、キャラクターの現在地に応じて Voice Room だけが切り替わります。Presence Room（`goten-presence`）は接続中ずっと維持されます。

テキスト入力欄（表示名など）にフォーカスがある間は、WASD / 矢印キーによるキャラクター移動を行いません。

## 通信構成

```text
Presence Room (goten-presence)
  全ユーザーが接続中ずっと参加
  座標・向き・移動状態・マップ部屋・Voice room 名を共有
  音声は publish しない

Voice Room (kitchen / hallway / living-room / work-room / entrance)
  現在のマップ部屋に応じて切り替え
  マイク音声だけを publish
```

- 別の Voice Room にいても、他ユーザーのキャラクターはマップ上に見える
- 同じ Voice Room にいる場合だけ音声が聞こえる
- Voice Room を切り替えても remote player は削除されない
- Presence から切断／退出したユーザーだけがマップから消える

## 必要環境

- Node.js 20以上
- npm
- Homebrew
- LiveKit Server

## LiveKit Serverのインストール

```bash
brew update
brew install livekit
```

## 起動

```text
Terminal 1: livekit-server --dev
Terminal 2: npm run dev:app
```

`npm run dev:app` はトークンAPI（`:8787`）と Vite（`:5173`）をまとめて起動します。LiveKit Server だけは別ターミナルで起動してください。どちらかが終了すると、もう一方の子プロセスも終了します。

従来どおり3ターミナルでも起動できます。

```bash
livekit-server --dev
```

```bash
cd server
npm run dev
```

```bash
npm run dev
```

`livekit-server --dev` はローカル開発専用です。このモードでは次の placeholder 資格情報が使われます。

- API Key: `devkey`
- API Secret: `secret`
- WebSocket URL: `ws://localhost:7880`

本番や LiveKit Cloud では別の Key / Secret を使い、`devkey` / `secret` を使わないでください。API Secret はバックエンドの環境変数にだけ置き、フロントエンドには含めません。

### バックエンド API

- `POST /api/livekit/session` … participant identity を生成し、Presence 用トークンを返す
- `POST /api/livekit/voice-token` … 同じ identity で Voice 用トークンを返す

**注意（ローカル MVP）:** Voice トークン発行時にクライアントが `participantIdentity` を指定します。これは認証のないローカル開発用の簡易方式であり、本番ではクライアント指定の identity を信用してはいけません。本番ではサーバー側セッション／認証に紐づけて identity を発行してください。

## フロントエンド起動

別ターミナル（リポジトリルート）:

```bash
npm install
npm run dev
```

Vite の `base` は `/GOTEN-MEET/` です。ターミナルに表示された URL（多くの場合 `http://localhost:5173/GOTEN-MEET/`）を開いてください。ルートの `http://localhost:5173/` だけでは正しく動かないことがあります。

## 起動するプロセス

```text
Terminal 1: livekit-server --dev
Terminal 2: npm run dev:app
```

または従来どおり:

```text
Terminal 1: livekit-server --dev
Terminal 2: cd server && npm run dev
Terminal 3: npm run dev
```

### Session request failed / トークンAPIエラー

接続時にセッションエラーが出た場合は次を確認してください。

1. LiveKit Server（`livekit-server --dev`）が起動しているか
2. トークンAPI（`cd server && npm run dev`、または `npm run dev:app`）が `:8787` で起動しているか
3. Vite が起動しており、`/api` が `:8787` へプロキシされているか
4. `server/.env` の LiveKit URL / Key / Secret がローカル開発用になっているか

ローカルでトークンAPIが止まっている場合、UI は「トークンAPI（localhost:8787）に接続できません」と案内します。曖昧な `Session request failed (500)` だけにはしません。

### ローカル開発と GitHub Pages

- **ローカル:** Vite + トークンAPI（`:8787`）+ LiveKit Server の3プロセスが必要です（`npm run dev:app` で API と Vite を同時起動可）
- **GitHub Pages:** 静的フロントのみが公開されます。`/api/livekit/*` や LiveKit は Pages には含まれないため、バックエンド API と LiveKit は別途デプロイ／公開が必要です

### remote player の表示

remote player は Presence Room の参加状態を正とします。位置パケットが一時的に途切れてもマップから消しません。Voice Room の切り替えでも消しません。Presence から退出／切断したときだけ消えます。再接続して Presence snapshot を受け取ると再表示されます。

## 動作確認

### 入力中の移動停止

1. ゲーム画面を開く
2. 表示名入力欄へフォーカスする
3. `alice` や `wasd` と入力する
4. キャラクターが移動しないこと
5. 入力欄からフォーカスを外す（マップをクリックするなど）
6. WASD または矢印キーで再び移動できること

### 全体表示と音声分離

1. 通常ウィンドウで `alice` として接続
2. シークレットウィンドウで `bob` として接続
3. alice をリビングへ移動
4. bob をキッチンへ移動
5. 互いのキャラクターが画面上に表示されたままであること
6. 異なる音声 room なので音声が聞こえないこと
7. alice をキッチンへ移動
8. bob のキャラクターが途中で消えないこと
9. Voice Room が同じになった後、音声が再び聞こえること
10. 距離に応じた音量減衰が動作すること
11. alice だけ廊下へ移動
12. bob は表示されたまま、音声だけ切れること
13. 退出したユーザーだけが画面から消えること

### 服色

1. alice と bob の肌色が自然な元画像の色であること
2. 服の色が互いに異なる、または identity に対応した variant になっていること
3. 髪、目、輪郭の色が変化していないこと
4. 歩行アニメーション中も服色が正しいこと
5. 向きを変えても服色が正しいこと
6. room を切り替えても服色が変わらないこと
7. ページ上に緑色の肌のキャラクターが存在しないこと
8. 5人分程度の identity で服色 variant が破綻しないこと

### 距離による音量減衰

1. 通常ウィンドウで `alice` として参加する
2. シークレットウィンドウで `bob` として参加する
3. 同じマップ部屋へ移動する
4. 両者を近づける
5. 相手の音声が通常音量で聞こえること
6. 一方を少しずつ離す
7. 距離に応じて滑らかに音量が下がること
8. 無音距離以上に離す
9. 音声が聞こえなくなること
10. 再び近づく
11. 音声が滑らかに戻ること
12. 別の Voice Room へ移動する
13. remote player は残り、音声だけ消えること
14. 同じ Voice Room へ戻る
15. 座標取得後に距離音量が再適用されること
16. 「距離に応じて音量を変える」を OFF にする
17. 距離に関係なく音量 1.0 へ戻ること
18. 再度 ON にする
19. 現在距離に応じた音量へ戻ること
20. 退出・再接続後も動作すること

同じ PC の 2 ブラウザで確認する場合は、片方向ずつテストし、反対側のマイクをミュートしてください。イヤホン推奨です。

### 手動 room 接続（デバッグ用）

1. 「マップの部屋と音声を連動する」を OFF にする
2. Voice room 名を手動入力する（例: `living-room`）
3. 接続し、ミュートと退出を確認する

ハウリング防止のため、イヤホンを使うか、一方のマイクをミュートしてテストしてください。

ブラウザがリモート音声をブロックした場合は、音声パネルの「音声を有効にする」を押してください。

## マップの編集

間取りは次のファイル内で直接定義しています。

```text
src/game/houseGame2.ts
```

部屋の位置・大きさ、壁の開口部、家具の座標を変更すると、ブラウザ上の表示と当たり判定に反映されます。Tiled Map Editorや外部のマップJSONは使用していません。

現在の配置は次の考え方です。

- リビングは正方形
- リビングの上に横廊下を挟んで横長のキッチン
- リビングの右に縦廊下を挟んで長方形の作業部屋
- リビング右下、縦廊下下端、作業部屋左下が玄関に接続
- リビング上部約3分の2は畳、下部約3分の1は木床

## 本番ビルド

フロント:

```bash
npm run build
npm run preview
```

バックエンド:

```bash
cd server
npm run typecheck
npm run build
```

軽量チェック:

```bash
npm run check
```

## 技術構成

- React
- TypeScript
- Vite
- Phaser 3
- Hono（トークン発行 API）
- LiveKit（Presence + Voice）

## 次の実装候補

1. 実際の家に合わせた間取り・家具位置の微調整
2. 左右パンニングや立体音響
3. 部屋チャットと家全体チャット
4. ユーザー認証と本番向け identity 管理
5. デプロイ（Workers / Pages / LiveKit Cloud）
