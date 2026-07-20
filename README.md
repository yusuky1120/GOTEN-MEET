# GOTEN MEET

Tiled Map Editorで編集できる、32×24マスの2Dシェアハウスマップ・プロトタイプです。

## 現在できること

- Tiled互換JSONマップの読み込み
- WASDまたは矢印キーによるアバター移動
- 壁・家具・階段との衝突判定
- Tiledのオブジェクトレイヤーを利用した初期位置設定
- Tiledの部屋領域を利用した現在地表示

現時点ではフロントエンドのみです。LiveKit、複数人同期、文字チャット、認証、DBは未実装です。

## ローカル起動

Node.js 20以降を推奨します。

```bash
npm install
npm run dev
```

## Tiledでマップを編集する

Tiled Map Editorで次のファイルを開いてください。

```text
public/maps/house-1f.json
```

タイル画像は次のファイルです。

```text
public/tiles/house-tiles.svg
```

JSON内では相対パス `../tiles/house-tiles.svg` を指定しています。Tiledから画像の場所を聞かれた場合は、このファイルを選択してください。

編集後は、同じ `public/maps/house-1f.json` にJSON形式で上書き保存し、ブラウザをリロードします。

## マップ仕様

- マップサイズ: 32×24マス
- タイルサイズ: 32×32px
- マップ全体: 1024×768px
- 形式: Orthogonal / JSON

### タイルID

| ID | 用途 | 当たり判定 |
|---:|---|---|
| 0 | 空白 | なし |
| 1 | フローリング | なし |
| 2 | 畳 | なし |
| 3 | タイル・石目 | なし |
| 4 | 壁 | あり |
| 5 | 机・テーブル | あり |
| 6 | 椅子・ソファ | あり |
| 7 | 布団 | あり |
| 8 | 階段 | あり |

### レイヤー

- `Ground`: 床用。ID 1〜3を配置します。
- `Objects`: 壁・家具用。ID 4〜8を配置します。
- `Markers`: スポーン地点と部屋領域を置くオブジェクトレイヤーです。

床と家具を別レイヤーにしているため、畳の上に机を置いても床が消えません。

## Markersレイヤー

### 初期位置

ポイントオブジェクトを置き、以下を設定します。

```text
name: spawn
type: spawn
```

### 部屋領域

長方形オブジェクトを置き、以下を設定します。

```text
type: room
name: リビング など
```

必要に応じて文字列プロパティ `roomName` を設定できます。`Markers`がなくても移動自体は動作しますが、初期位置は左上寄りとなり、現在地表示は「マップ内」になります。

## GeminiでJSONを生成する場合の注意

Phaserで表示するには、`width`、`height`、`tilewidth`、`tileheight`、`layers`に加えて、現在のJSONにある `tilesets` ブロックも残してください。

Geminiが1枚のタイルレイヤーだけを生成した場合も読み込めますが、編集しやすさのため、床を`Ground`、壁・家具を`Objects`に分けることを推奨します。各レイヤーの`data`は32×24＝768要素です。

## 本番ビルド

```bash
npm run build
npm run preview
```

## 技術構成

- React
- TypeScript
- Vite
- Phaser 3
- Tiled Map Editor

## 次の実装候補

1. Tiled上で実際の間取りに合わせて修正
2. Socket.IOによる複数人の位置同期
3. LiveKitによる部屋・距離ベースの音声通話
4. 部屋チャットと家全体チャット
