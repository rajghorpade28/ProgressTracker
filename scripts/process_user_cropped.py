import os
import base64
import json
import math
from PIL import Image
import numpy as np

REF_DIR = r'd:\Engineering\Projects\study\reference_images'
OUT_ASSETS = r'd:\Engineering\Projects\study\tracker\assets\quotes'
os.makedirs(OUT_ASSETS, exist_ok=True)

MAPPING = [
    {
        'id': 'krishna',
        'author': 'Shri Krishna',
        'quote': 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।',
        'isSanskrit': True,
        'file': os.path.join(REF_DIR, 'ChatGPT Image Sep 14, 2026, 01_05_15 AM.png'),
        'threshold': 120.0
    },
    {
        'id': 'vivekananda',
        'author': 'Swami Vivekananda',
        'quote': 'Arise, awake, and stop not till the goal is reached.',
        'isSanskrit': False,
        'file': os.path.join(REF_DIR, 'ChatGPT Image Sep 14, 2026, 12_34_25 AM.png'),
        'threshold': 115.0
    },
    {
        'id': 'kalam',
        'author': 'Dr. A.P.J. Abdul Kalam',
        'quote': 'You have to dream before your dreams can come true.',
        'isSanskrit': False,
        'file': os.path.join(REF_DIR, 'ChatGPT Image Sep 14, 2026, 12_35_29 AM.png'),
        'threshold': 115.0
    },
    {
        'id': 'andrew_ng',
        'author': 'Andrew Ng',
        'quote': "Don't worry about being the best. Worry about being better than you were yesterday.",
        'isSanskrit': False,
        'file': os.path.join(REF_DIR, 'ChatGPT Image Sep 14, 2026, 12_36_48 AM.png'),
        'threshold': 125.0
    },
    {
        'id': 'linus',
        'author': 'Linus Torvalds',
        'quote': 'Talk is cheap. Show me the code.',
        'isSanskrit': False,
        'file': os.path.join(REF_DIR, 'ChatGPT Image Sep 14, 2026, 12_37_27 AM.png'),
        'threshold': 115.0
    },
    {
        'id': 'jensen',
        'author': 'Jensen Huang',
        'quote': "Run, don't walk. Remember, either you're running for food, or you are running from becoming food.",
        'isSanskrit': False,
        'file': os.path.join(REF_DIR, 'ChatGPT Image Sep 14, 2026, 12_38_45 AM.png'),
        'threshold': 115.0
    }
]

TARGET_H = 300
GRID = 2.0
MAX_R = (GRID / 2.0) * 0.95

def atkinson_dither(img_arr, thresh=120.0):
    arr = img_arr.copy().astype(np.float32)
    h, w = arr.shape
    out = np.zeros((h, w), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            old = arr[y, x]
            new = 255.0 if old > thresh else 0.0
            out[y, x] = int(new)
            err = (old - new) / 8.0
            if x + 1 < w: arr[y, x + 1] += err
            if x + 2 < w: arr[y, x + 2] += err
            if y + 1 < h:
                if x - 1 >= 0: arr[y + 1, x - 1] += err
                arr[y + 1, x] += err
                if x + 1 < w: arr[y + 1, x + 1] += err
            if y + 2 < h:
                arr[y + 2, x] += err
    return out

out_quotes = []

for q in MAPPING:
    src = Image.open(q['file']).convert('RGB')
    print(f"Processing {q['id']}: original crop size = {src.size}")

    # Scale directly so that image height is EXACTLY TARGET_H (300px)
    # Zero artificial canvas padding so image boundaries strictly touch container
    scale = TARGET_H / src.height
    new_w = int(round(src.width * scale))
    new_h = TARGET_H
    resized_lores = src.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Build high-res version (3x)
    hires_w = new_w * 3
    hires_h = new_h * 3
    resized_hires = src.resize((hires_w, hires_h), Image.Resampling.LANCZOS)

    # Save PNG and WebP
    png_path = os.path.join(OUT_ASSETS, f"{q['id']}.png")
    webp_path = os.path.join(OUT_ASSETS, f"{q['id']}.webp")
    resized_hires.save(png_path)
    resized_lores.save(webp_path, quality=85)

    # Encode base64 data URI
    with open(webp_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    data_uri = f"data:image/webp;base64,{b64}"

    # Downscale grayscale to Atkinson grid
    CW = int(round(new_w / GRID))
    CH = int(round(new_h / GRID))
    canvas_gray = resized_lores.convert('L')
    down = canvas_gray.resize((CW, CH), Image.Resampling.LANCZOS)
    down_arr = np.array(down)
    dithered = atkinson_dither(down_arr, thresh=q['threshold'])

    dots_list = []
    for r in range(CH):
        for c in range(CW):
            if dithered[r, c] > 0:
                cx = round((c + 0.5) * GRID, 1)
                cy = round((r + 0.5) * GRID, 1)
                lum = float(down_arr[r, c]) / 255.0
                intensity = round(0.5 + 0.5 * lum, 2)
                rad = round(max(0.40, MAX_R * (0.65 + 0.35 * lum)), 2)
                alpha = round(0.40 + 0.60 * intensity, 2)
                dots_list.append([cx, cy, rad, alpha, round(cx / new_w, 3), round(cy / TARGET_H, 3)])

    print(f" -> {q['id']}: generated {len(dots_list)} dots (size={new_w}x{new_h}, grid={CW}x{CH})")

    out_quotes.append({
        'author': q['author'],
        'quote': q['quote'],
        'imagePath': f"assets/quotes/{q['id']}.png",
        'imageDataUri': data_uri,
        'isSanskrit': q['isSanskrit'],
        'width': new_w,
        'height': TARGET_H,
        'dots': dots_list
    })

js_file = r'd:\Engineering\Projects\study\tracker\js\quotes-data.js'
js_content = 'window.MOTIVATIONAL_QUOTES = ' + json.dumps(out_quotes, ensure_ascii=False) + ';\n'
with open(js_file, 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f"Successfully wrote {js_file}, size: {len(js_content)} bytes")
