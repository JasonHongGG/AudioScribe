# AudioScribe - UI Architecture Specification

## 1. 專案概述 (Project Overview)
AudioScribe 是一個基於 Tauri + React 建構的桌面端應用程式。主要功能為載入音訊/視訊檔案、透過視覺化波形進行區段編輯（保留/排除/剪裁）、並將這些區段送到後端的語音轉文字模型（如 Faster-Whisper, Qwen3-ASR）進行批次處理。
本文件詳細記載了 UI 端的架構設計，即便專案程式碼遺失，亦可依據此文件完整重建出相同邏輯與互動架構的 UI。

## 2. 核心技術選型 (Tech Stack)
*   **底層/跨平台框架**: Tauri (Rust 後端，與前端進行 IPC 通訊，處理原生視窗與拖曳)
*   **前端框架**: React 18 + Vite + TypeScript
*   **狀態管理**: Zustand (單一全域 Store)
*   **樣式與排版**: Tailwind CSS (使用 className 進行 utility-first 排版) + 原生 CSS (`index.css` 提供部分客製化 Scrollbar 等)
*   **動畫處理**: Framer Motion (用於視窗切換、選單彈出、佇列項目增刪動畫)
*   **音訊視覺化核心**: WaveSurfer.js (v7或以上)，並搭配其官方外掛 `RegionsPlugin` 與 `TimelinePlugin`
*   **圖示庫**: Lucide-React

## 3. Tauri 設定與原生整合 (Tauri Integration)
檔案位置: `ui/src-tauri/tauri.conf.json`
*   **無邊框視窗 (Frameless & Transparent Window)**: 在 `tauri.conf.json` 設定 `"decorations": false` 與 `"transparent": true`，UI 自行實作仿原生的標題列與拖曳區 (`data-tauri-drag-region`)。
*   **Asset Protocol**: 必須啟用 (設定 `"security": {"assetProtocol": {"enable": true}}`)，讓前端得以使用 `@tauri-apps/api/core` 的 `convertFileSrc` API，來突破瀏覽器限制、直接載入使用者磁碟上的絕對路徑音檔/影片檔至 WaveSurfer。
*   **原生拖拉事件 (Native Drag & Drop)**: 藉由監聽 `tauri://drag-enter`, `tauri://drag-leave`, `tauri://drag-drop` IPC 事件，支援從作業系統直接把真實路徑檔案拉進視窗，而非單純依賴網頁 DOM 的 drag API。

## 4. 全域狀態模型 (State Management)
檔案位置: `src/store/index.ts` (Zustand)

### 4.1 資料結構
*   `AudioSegment`: 單一音訊波形區段。
    *   `id`: `string`
    *   `start`: `number` (秒數)
    *   `end`: `number` (秒數)
    *   `included`: `boolean` (是否保留該段落，將影響波形顯示顏色與後端處理狀態)
*   `FileTask`: 上傳到駐列中的單一檔案任務。
    *   `id`: `string`
    *   `file`: `File | null` (如果是網頁原生上傳則有值)
    *   `file_path`: `string | null` (Tauri 原生拖曳的絕對路徑)
    *   `name`: `string`
    *   `status`: `'ready' | 'extracting' | 'transcribing' | 'done' | 'error'`
    *   `progress`: `number` (0~100)
    *   `provider`: `'faster-whisper' | 'qwen3-asr'`
    *   `modelSize`: `string` (如 'tiny', 'base', 'large-v3')
    *   `segments`: `AudioSegment[] | null`

### 4.2 Zustand Store (AppState)
包含下列狀態與 Actions：
*   **任務管理**: `tasks` 陣列、`addTask`, `removeTask`, `updateTask`。
*   **全域設定**: `globalProvider`, `globalModelSize`，以及對應的 `set` 變更涵式。模態選單的開關狀態 `isGlobalSettingsOpen` 及其切換涵式。
*   **目前選項**: `selectedTaskId` (右側目前編輯中的檔案 ID)，及 `selectTask` 涵式。
*   **批次進度控制**: 非同步的 `startBatchTranscription`。
*   **暫存參照**: `activeToolRef` (供事件監聽器可以在不重新綁定 Hook 的情況下讀取目前使用的工具狀態，包含 cut/include/exclude)。

## 5. UI 元件架構 (Component Tree)

### 5.1 `App.tsx` & `Layout/MainLayout.tsx` (根元件與版面配置)
*   **MainLayout**: 滿版佈局 (`w-screen h-screen overflow-hidden text-foreground bg-background`)。
    *   頂部 Header (高度 `h-10`) 置放 `data-tauri-drag-region` 屬性讓使用者可拖曳視窗，並加上自訂三個按鈕控制最小化、最大化、關閉視窗 (透過 `@tauri-apps/api/window` 的 `getCurrentWindow()` 功能 API)。
*   **App (首頁佈局)**: 在 MainLayout 底下分為左、右兩大區塊（Flex row 行佈局）。
    *   **左側**: `FileList`
    *   **右側主區塊**: 當 `tasks.length === 0` 時，顯示畫面置中的加入檔案提示訊息，使用者可點及該區塊開啟檔案選擇器，選擇檔案加入佇列。當有選中任務時則顯示 `FileEditor`。透過 Framer Motion 的 `AnimatePresence` 作為兩者的切換過場漸變動畫。
    *   **全螢幕隱藏掉落區**: 當佇列已有檔案時，畫面會被加上一層隱藏的透明 `Dropzone hidden` 以便使用者隨時在任何角落再度拖放檔案匯入。

### 5.2 `FileList.tsx` (左側任務列表)
*   **寬度固定**: `w-[340px]` 定寬排版。
*   **頂部資訊列**: 顯示目前的引擎配置名稱與全域設定按鈕。
*   **列表區**: 使用 `tasks.map()` 渲染每一個任務卡片。
    *   狀態顯示：不同 status 決定左側 icon 的底色與圖標（轉檔中顯示 Loading Spinner、完成顯示打勾等）。
    *   進度條：卡片底部有一個動態寬度的 border 代表 `progress` 進度百分比。
    *   互動：點擊後呼叫 `selectTask` 讓右側切換檔案。選中狀態的卡片需有高光標示並換上明顯邊框。Hover 狀態會顯示垃圾桶按鈕以呼叫 `removeTask` 移除隊列。
*   **底部按鈕**: 「Commence Batch」按鈕，綁定至 `startBatchTranscription`，執行批次任務。

### 5.3 `Dropzone.tsx` (檔案拖放元件)
*   負責監聽以下一種上傳來源：
    1. Tauri IPC payload (`tauri://drag-drop`) 陣列中拋出的實體檔案系統絕對路徑。
*   透過 `@tauri-apps/api/event` 的 `listen` 監聽 Drag-Enter/Leave 事件，拖拉時會出現一個「滿版半透明磨砂遮罩的 UI」，並寫有 "Drop to Add to Queue" 的文字提示。
*   自動過濾檔案只允許 (`.mp3`、`.wav`、`.mp4`、`.mkv` 等多媒體副檔名)，並建立預設的 Task 物件寫入 Zustand `addTask`。

### 5.4 `GlobalSettingsModal.tsx` (全域設定對話框視窗)
*   使用 Framer Motion 實作黑色半透明背景及浮動的對話框介面。
*   **左側 Tab 選單**: Transcription, General 三個分頁選項。
*   **右側內容區 (Transcription Tab)**:
    *   提供 AI 引擎選擇 (`faster-whisper`, `qwen3-asr`)。
    *   提供模型尺寸 (Model Size) 列表供選擇：(Tiny, Base, Small, Medium, Large-v2, Large-v3)，包含每個選項的文字敘述與建議。
    *   直接透過 `setGlobalProvider` 或 `setGlobalModelSize` 寫回 Zustand 全域偏好設定。

### 5.5 `FileEditor.tsx` (核心音訊檢視與編輯器)
本專案最複雜的元件，必須完美還原波形繪製與互動邏輯。

#### A. 工具列 (Toolbar)
包含三種狀態按鈕 (`activeTool`)，用以控制滑鼠在波形上的互動行為意圖：
1.  **分割**: 滑鼠點擊會將一個 Region 劈成兩半。
2.  **保留**: 將選中 Region 設為包含 (高亮的黃色亮色波形)。
3.  **排除**: 將選中 Region 設為排除 (暗色的灰色波形)。

#### B. 波形視覺化核心 (WaveSurfer)
*   **初始化 WaveSurfer**: 必須設定禁用原生滑鼠事件 (`interact: false`)，以免原生內建尋軌行為與我們自訂的拖曳平移 (Pan) 操作發生衝突。同時掛載 `RegionsPlugin` 與 `TimelinePlugin`。
*   **音訊載入**: 判定如果是原生網頁 File 上傳，呼叫 `URL.createObjectURL(file)`；若是來自 Tauri 的實體路徑字串，用 `@tauri-apps/api/core` 的 `convertFileSrc(path)` 轉換成 `http://asset.localhost` 協定網址後注入。
*   **動態波形顏色塗裝 (Canvas Gradient)**: 
    *   透過核心方法 `ws.setOptions({ waveColor: gradient, progressColor: gradient })` 達成各片段不同的波形顏色。
    *   建立一個 HTML Canvas 2D 渲染器，基於 Zustand store 中的 segments 陣列起始點與終點，動態計算時間比例，在水平方向加上 Color Stop。讓不同的時間區間依照 `included` 屬性顯示為特定顏色（如：黃色代表保留，灰色代表排除）。
*   **RegionsPlugin 控制把手**:
    *   這裡不使用 Regions 預設的高亮背景，純粹只保留用作拖拉編輯控制的邊界線而已（將顏色設為透明）。
    *   以 CSS 重製左右邊各條邊界線以及加粗可操作拖曳區範圍 (`cursor: col-resize`)。

#### C. 音軌編輯互動與事件鏈 (Interaction Logic)
*   **平移/縮放 (Pan & Zoom)**:
    *   在主要 Container 監聽 `mousedown`, `mousemove`, `mouseup`。當未點擊到 Region 範圍邊界時開啟自製平移 (Pan) 行為，透過更改波形的 Scroll 位置來跟著滑鼠拖曳做畫面平移。
    *   支援在主要波形區域利用滑鼠滾輪 (`onWheel`) 左右滾動查看波形。
    *   支援下方時間軸上 (`TimelinePlugin` 區域) 利用滑鼠滾輪 (`onWheel`) 控制放大/縮小 (`setZoom()`) 調整波形縮放比例 (x 軸的縮放比例(時間)，y 軸保持不變(音量)，讓我可以更細緻的調整保留的音訊區段)。
*   **分割段落 (Split - Cut Tool 模式)**: 
    *   當處於 `分割` 模式且為點擊 Container 行為時，會捕捉游標 X 座標相對於畫面的百分比，並轉換成在整個音訊時間範圍中確切的秒數。
    *   透過該秒數查找所處在哪一個 segment 區段底下，若找到，則將其切分成獨立的上、下兩個 Segment，並寫回 Zustand (`segments: newSegs`) 進行畫面刷新並加上全新一條 Region 分割線。
*   **屬性切換保留/排除 (Include/Exclude Mode)**: 
    *   於這兩種模式點擊段落時觸發 `region-clicked` 事件，將對應 segment 的 `included` 布林值設為 true 或是 false。
*   **刪除分割線 (Context Menu Right Click)**:
    *   對著 Container 波形處監聽瀏覽器原生又鍵選單事件 `contextmenu` (`e.preventDefault()`)。
    *   利用座標換算出當前右鍵的點擊時間，接著在 Zustand 中的分割點尋找誤差在極小範圍內 (小於15 pixel) 的點。若匹配成功，代表使用者意圖刪除該分割線，則將該切割線左方與右方的 Segment 融合並寫入 Zustand，使得該分割線消失，融合準則已左方 state 為主。
*   **區段拖曳與資料綁定 (Region Resize)**: 
    *   監聽 WaveSurfer `region-update` 事件來設置嚴格的拖拉範圍上限，強勢攔截邊界，確保每個段落都不得互相超前或穿透別人。
    *   監聽 `region-updated` (也就是拖拉動作結束)，才真正將新的 `start` / `end` 表單資料結果回存至 Zustand `updateTask({segments})`。

#### D. 底部控制儀表板與熱鍵 (Player Dashboard)
*   **尋軌拉桿 (Seek Bar)**: 在 WaveSurfer 下方自製一個 `<input type="range" class="appearance-none" />` 作為進度控制條，同時監聽 `onMouseDown` 開啟拖曳模式並發送 `ws.setTime()` 即時控制播放頭；也監聽 `onChange` 事件來更新時間顯示 (0:00 格式)。
*   **播放按鈕與快速跳躍區段**:
    *   中央放置特大號的主控 Play / Pause 觸發按鍵。
    *   提供以跳躍為單位的自訂按鍵 -5s, -1s, +1s, +5s。
*   **全域鍵盤快速鍵支援**:
    *   在 DOM 初始化後綁定 `window.addEventListener('keydown')` 來攔截與監測。
    *   不干擾 Input 等元件狀況下，設定 Left/Right 箭頭對應 5 秒跳躍，而 `,` 或 `<` 及 `.` 或 `>` 鍵盤符號對應 1 秒跳躍快轉。

## 6. 依據本計畫書重建造專案之標準流程
未來若需從零開始重建此架構：
1. **建立專案環境**: `npm create tauri-app@latest`，選擇框架: React 以及 TypeScript 作為開發語系。
2. **安裝必要 NPM 依賴**: 安裝 `zustand` (狀態管理)、`framer-motion` (UI轉場動畫)、`lucide-react` (SVG圖示庫)、`tailwindcss`, `postcss`, `autoprefixer` (樣式系統)、`wavesurfer.js` (音頻引擎處理)。
3. **架設全域狀態與資料傳遞**: 建立 `src/store/index.ts` Zustand 模型結構，準備好符合上述規格定義的 `FileTask` 與 `AudioSegment`，完成 CRUD 與播放引擎全域狀態的設定。
4. **準備 Tauri Config**: 於 `src-tauri/tauri.conf.json` 設定無邊框與透明視窗，並開啟 `assetProtocol` 的讀取權限。
5. **切割版面元件**: 實作 `MainLayout.tsx` 為滿版框殼以及可供系統識別與滑鼠左鍵可拉動視窗的 `data-tauri-drag-region` 區塊，再以 flex row 排列將介面剖分好 `FileList` 及主畫面顯示區。
6. **對接本地原生拖曳 API**: 完成 `Dropzone` 從網頁原生 input 或 `tauri://drag-drop` Payload 取絕對路徑字串的功能。
7. **硬漢級 WaveSurfer 高度客製**: 從 `FileEditor` 取消原生 WaveSurfer 的預設滑鼠行為，並採用自行撰寫的外皮 (`region-update`, 自行攔截滑鼠 `wheel` 事件平移等等)。利用底層建立特製的 HTML5 Canvas 漸層來將時間切片填上不同顏色 (保留為亮色，排除為暗色)。並依序完成分割點裁切 (Cut) 與兩區段互相同整消去的左鍵與右鍵行為邏輯。由於這是專案的血脈，互動手感全在此元件中必須細細除錯調整。
8. **總結串接**: 檢查 Global settings model 開關參數變化、Tauri 背景程式編譯功能完成此專案建置。
