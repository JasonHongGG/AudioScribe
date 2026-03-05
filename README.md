# AudioScribe

AudioScribe 是純 STT（Speech-to-Text）批次轉錄工具。

## 架構（STT 模組化）

- `audioscribe/stt/base.py`：`STTProvider` 抽象介面
- `audioscribe/stt/provider_registry.py`：provider 建立與註冊
- `audioscribe/stt/`：STT provider 實作
	- `faster_whisper_provider.py`
	- `qwen3_asr_provider.py`
- `audioscribe/application/transcription_service.py`：核心轉錄流程
- `audioscribe/application/job_manager.py`：非同步工作排程與狀態管理
- `audioscribe/api/http.py`：FastAPI 介面
- `audioscribe/worker.py`：worker 入口
- `app.py`：CLI 批次入口

## 環境與安裝（完全使用 uv）

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

## 使用方式

1. 將音檔放入 `audio/`
2. 執行轉錄，輸出會到 `output/`

### 預設（faster-whisper）

```bash
uv run python app.py
```

### 切換成 Qwen3-ASR

```bash
uv run --extra qwen python app.py --stt-provider qwen3-asr
```

### 指定資料夾

```bash
uv run python app.py --audio-dir audio --output-dir output
```