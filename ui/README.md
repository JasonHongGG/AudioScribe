# AudioScribe UI

桌面端採用 Tauri + React。UI 只負責使用者互動、波形編輯與任務佇列，Python backend 由 Tauri 在啟動時自動拉起。

## 開發方式

1. 先建立 backend 虛擬環境與依賴。
2. 在 `ui/` 執行 `npm install`。
3. 用 `npm run tauri dev` 啟動桌面應用。

如果 backend Python 不在預設的 `../backend/.venv`，可用環境變數 `AUDIOSCRIBE_BACKEND_PYTHON` 指到正確的 Python 執行檔。

## Release 打包

Windows GPU 版 release 可以直接執行：

```bash
npm run build:release
```

流程會先建立 `src-tauri/resources/backend-runtime/` 與 `src-tauri/resources/ffmpeg/`，再呼叫 `tauri build` 產生安裝包。
