FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN python -m pip install --upgrade pip setuptools wheel

RUN python -m pip install \
    paddlepaddle==3.2.0 \
    -i https://www.paddlepaddle.org.cn/packages/stable/cpu/

RUN python -m pip install \
    paddleocr==3.7.0 \
    fastapi==0.141.1 \
    uvicorn==0.52.4 \
    numpy==2.3.5 \
    Pillow==12.1.0 \
    python-multipart==0.0.32

COPY app.py .

ENV PADDLE_PDX_MODEL_SOURCE=BOS

RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(lang='korean', ocr_version='PP-OCRv5', device='cpu', use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False); print('OCR models cached')"

CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]