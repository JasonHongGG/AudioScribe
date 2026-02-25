# AudioScribe

AudioScribe 是純 STT（Speech-to-Text）批次轉錄工具。

## 架構（STT 模組化）

- `audioscribe/interfaces/stt.py`：`STTProvider` 介面
- `audioscribe/stt/`：STT provider 實作
	- `faster_whisper_provider.py`
	- `qwen3_asr_provider.py`
- `audioscribe/factories/stt_factory.py`：`STTFactory`，負責建立可替換 STT provider
- `audioscribe/batch_transcriber.py`：批次流程（只依賴 STT 介面）
- `app.py`：CLI 入口

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