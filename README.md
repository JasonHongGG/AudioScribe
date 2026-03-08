# AudioScribe

AudioScribe 是桌面優先的 STT（Speech-to-Text）批次轉錄工具。

## 架構

- `ui/`：Tauri + React 桌面 UI
- `ui/src-tauri/`：桌面殼、sidecar supervisor、動態 backend endpoint 配置
- `ui/src/features/backend/`：frontend runtime handshake 與 backend client 契約
- `ui/src/features/tasks/`：任務工作流模型、媒體準備與批次轉錄流程
- `backend/audioscribe/contracts.py`：backend API 契約
- `backend/audioscribe/api/http.py`：唯一的 HTTP API 入口
- `backend/audioscribe/infrastructure/workspace.py`：job artifact 與 media cache workspace
- `backend/audioscribe/application/job_manager.py`：job 啟動、worker 監控、結果輪詢
- `backend/audioscribe/application/worker_job.py`：單一 worker 執行流程
- `backend/audioscribe/application/transcription_service.py`：音訊切段、裁切、轉錄輸出
- `backend/audioscribe/stt/`：STT provider 實作與 registry

舊的 CLI 批次入口、固定 port frontend API 綁定、以及來源資料夾直寫輸出流程已移除。系統現在只保留桌面 UI + backend sidecar + job workspace 的單一路徑。

## 執行模型

- Tauri 啟動時會建立 backend sidecar，並回傳動態 HTTP endpoint 給 frontend。
- 原始碼模式下 backend 仍從 repo 啟動，但 job artifact、暫存檔、媒體抽取快取、transcript 與 sidecar log 都寫入使用者 app data 目錄。
- 前端任務模型已改成 workflow-oriented 結構：source、media、transcription、editor、runtime、result 分離。

## Release 打包

目前只支援 GPU 版本 release，不提供 CPU 版 runtime。

### 前置條件

- `backend/.venv` 已建立並安裝 GPU 版 backend 依賴
- `ffmpeg.exe` 與 `ffprobe.exe` 可由系統 `PATH` 找到，或在執行 build 前透過環境變數覆寫

### 一鍵出包

```bash
cd ui
npm run build:release
```

這個流程會先執行 `scripts/build-backend-runtime.ps1`，將下列資源組到 `ui/src-tauri/resources/`：

- 可隨 app 發佈的 Python runtime
- `backend/audioscribe` backend 程式碼
- backend `.venv` 內的 Python 套件
- `ffmpeg.exe` / `ffprobe.exe`

之後再執行 `tauri build` 產生安裝包。

### 產物位置

- `ui/src-tauri/target/release/bundle/msi/AudioScribe_0.1.0_x64_en-US.msi`
- `ui/src-tauri/target/release/bundle/nsis/AudioScribe_0.1.0_x64-setup.exe`

## Backend 安裝

1. 安裝 `uv`

```bash
pip install uv
```

2. 建立並同步環境（預設含 `faster-whisper`）

```bash
uv sync
```

3. 若要使用 Qwen3-ASR，安裝 `qwen` extra

```bash
uv sync --extra qwen
```

## 啟動方式

1. 安裝 UI 依賴

```bash
cd ui
npm install
```

2. 啟動桌面應用

```bash
npm run tauri dev
```

若 backend Python 不在 `backend/.venv`，可先設定環境變數：

```bash
set AUDIOSCRIBE_BACKEND_PYTHON=C:\path\to\python.exe
```

backend sidecar 會自動選擇可用的 localhost port，不再固定綁定 `127.0.0.1:8000`。