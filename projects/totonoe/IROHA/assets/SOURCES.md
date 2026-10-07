# IROHA asset sources

## Curriculum category illustrations

2026-10-01に内蔵のimagegenで8分野を個別生成。共通指示は「純白背景、中央に一つの大きな図解、深緑の輪郭・セージ・控えめなテラコッタ、文字・枠・写真なし」。分野別の主題は次のとおり。

- `category-literacy.webp`: 本・確認の印・盾
- `category-llm.webp`: 対話の吹き出し・要約文書
- `category-image.webp`: 線画から完成画像へ
- `category-video.webp`: 連続フレームから再生画面へ
- `category-setup.webp`: 設定歯車・接続・完了印
- `category-organization.webp`: チームへの提案・説明
- `category-automation.webp`: 表計算から自動処理を経て完成物へ
- `category-other.webp`: 文書・カメラ・対話を収めた道具箱

採用した生成PNGを幅640pxのWebP（品質82）へ変換してサイト用に保存。元の生成画像はCodexの生成画像領域に保持。

## Completion stickers

2026-10-01、内蔵imagegenで8分野の異なる場面を制作。公式ツグモ・ハクト・ミオンのモデルシートを人物の参照とし、前版の `badge-trio-completion.webp` をステッカー形状の参照に使用。各画像のリボン内の文字もimagegenで生成し、目視で正確な表記を確認した。元の生成PNGは `/Users/kantoshi/.codex/generated_images/01a0ed8a-7c8b-7660-8899-11f26da7d84a/` に保持。サイト用は透過512×512px、WebP品質84。

| 分野 | 採用ファイル | 画像内の文字 | 場面 |
|---|---|---|---|
| AIリテラシー | `badge-scene-literacy.webp` | AIリテラシー | 資料の確認と虫眼鏡 |
| LLM・対話AI | `badge-scene-llm.webp` | 対話AI | 質問と応答 |
| 画像生成AI | `badge-scene-image.webp` | 画像生成 | 風景画を作る |
| 動画生成AI | `badge-scene-video.webp` | 動画生成 | カメラと絵コンテ |
| 導入・初期設定 | `badge-scene-setup.webp` | 初期設定 | PC設定と接続確認 |
| 組織導入・提案 | `badge-scene-organization.webp` | 組織導入 | チームへの提案 |
| 業務自動化 | `badge-scene-automation.webp` | 業務自動化 | 書類から表計算への処理 |
| その他 | `badge-scene-other.webp` | 新しい学び | 新しい道具の探索 |

共通の生成指示: 3人の公式キャラクターを保ち、森の緑・白縁・葉と曲線のある円形ステッカーにする。各分野固有の活動を描き、画像内に指定の日本語だけを大きく入れる。外側は透過する。レッスン名・取得日・取得状態は画面側で表示する。未取得は画像を暗色にし、公開レッスンの修了後にカラーへ切り替える。公開教材がまだない分野は「教材準備中」とする。

前版の `badge-trio-completion.webp` は現行画面では参照しない。生成済みの採用素材として保持する。

以前生成した `badge-background-*.webp` は現行画面では参照しない。生成済み素材として保持し、削除判断は別途行う。

## Tool logos

Retrieved on 2026-09-11. Logos remain the property of their respective owners and are used only to identify the related learning curriculum.

- `chatgpt.svg`: OpenAI Blossom rendered by the official OpenAI brand page. Usage follows the [OpenAI Design Guidelines](https://openai.com/brand/).
- `claude.svg`: `ClaudeIcon-Rounded.svg` from the official [Anthropic press kit](https://www.anthropic.com/press-kit).
- `gemini.svg`: Gemini sparkle delivered by the official Gemini website from `https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg`.

Do not recolor, distort, crop, add effects to, or use these marks more prominently than the ToToNoE+ identity.
