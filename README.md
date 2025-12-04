# AudioScribe

### cudnn_ops64_9.dll
```
pip install "nvidia-cudnn-cu12==9.1.0.70"

export PATH="$VIRTUAL_ENV/Lib/site-packages/nvidia/cudnn/bin:$PATH"
```

### cublas64_12.dll
```
pip install "nvidia-cublas-cu12==12.3.4.1"

export PATH="$VIRTUAL_ENV/Lib/site-packages/nvidia/cublas/bin:$PATH"
```

### 套件環境變數設定
在 .venv/Scripts/activate 檔案中直接加入

export PATH="$VIRTUAL_ENV/Lib/site-packages/nvidia/cublas/bin:$PATH"

export PATH="$VIRTUAL_ENV/Lib/site-packages/nvidia/cudnn/bin:$PATH"