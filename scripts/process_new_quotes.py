import os, base64, json, math
from PIL import Image
import numpy as np

mapping = [
    {
        'id': 'krishna',
        'author': 'Shri Krishna',
        'quote': 'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।',
        'isSanskrit': True,
        'note': 'Bhagavad Gita 2.47 • Karma Yoga',
        'file': r'd:\Engineering\Projects\study\reference_images\ChatGPT Image Sep 14, 2026, 12_33_09 AM.png',
        'threshold': 120.0
    },
    {
        'id': 'vivekananda',
        'author': 'Swami Vivekananda',
        'quote': 'Arise, awake, and stop not till the goal is reached.',
        'isSanskrit': False,
        'note': 'Katha Upanishad • Infinite Will',
        'file': r'd:\Engineering\Projects\study\reference_images\ChatGPT Image Sep 14, 2026, 12_34_25 AM.png',
        'threshold': 115.0
    },
    {
        'id': 'kalam',
        'author': 'Dr. A.P.J. Abdul Kalam',
        'quote': 'You have to dream before your dreams can come true.',
        'isSanskrit': False,
        'note': 'Wings of Fire • Relentless Aspiration',
        'file': r'd:\Engineering\Projects\study\reference_images\ChatGPT Image Sep 14, 2026, 12_35_29 AM.png',
        'threshold': 115.0
    },
    {
        'id': 'andrew_ng',
        'author': 'Andrew Ng',
        'quote': "Don't worry about being the best. Worry about being better than you were yesterday.",
        'isSanskrit': False,
        'note': 'DeepLearning.AI • Continuous Iteration',
        'file': r'd:\Engineering\Projects\study\reference_images\ChatGPT Image Sep 14, 2026, 12_36_48 AM.png',
        'threshold': 125.0
    },
    {
        'id': 'linus',
        'author': 'Linus Torvalds',
        'quote': 'Talk is cheap. Show me the code.',
        'isSanskrit': False,
        'note': 'Linux Kernel • Uncompromising Craft',
        'file': r'd:\Engineering\Projects\study\reference_images\ChatGPT Image Sep 14, 2026, 12_37_27 AM.png',
        'threshold': 115.0
    },
    {
        'id': 'jensen',
        'author': 'Jensen Huang',
        'quote': "Run, don't walk. Remember, either you're running for food, or you are running from becoming food.",
        'isSanskrit': False,
        'note': 'NVIDIA • High-Velocity Drive',
        'file': r'd:\Engineering\Projects\study\reference_images\ChatGPT Image Sep 14, 2026, 12_38_45 AM.png',
        'threshold': 115.0
    }
]

TARGET_W = 320
TARGET_H = 400
grid = 2.0
max_r = (grid / 2.0) * 0.95

cw = int(TARGET_W / grid)
ch = int(TARGET_H / grid)

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

for q in mapping:
    src = Image.open(q['file']).convert('L')
    
    # 4:5 crop of outer black padding
    src_aspect = src.width / src.height
    target_aspect = TARGET_W / TARGET_H # 0.8
    
    # Center crop slightly to 4:5
    if src_aspect > target_aspect:
        new_w = int(src.height * target_aspect)
        offset_x = (src.width - new_w) // 2
        cropped = src.crop((offset_x, 0, offset_x + new_w, src.height))
    else:
        new_h = int(src.width / target_aspect)
        offset_y = (src.height - new_h) // 2
        cropped = src.crop((0, offset_y, src.width, offset_y + new_h))
        
    # Save high-res 960x1200 PNG
    hires = cropped.resize((960, 1200), Image.Resampling.LANCZOS)
    png_path = f"assets/quotes/{q['id']}.png"
    hires.save(png_path)
    
    # Save optimized 320x400 WebP
    lores = cropped.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    webp_path = f"assets/quotes/{q['id']}.webp"
    lores.save(webp_path, quality=85)
    
    # Base64 data URI
    with open(webp_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    data_uri = f'data:image/webp;base64,{b64}'
    
    # Downscale for Atkinson dither grid
    down = lores.resize((cw, ch), Image.Resampling.LANCZOS)
    down_arr = np.array(down)
    dithered = atkinson_dither(down_arr, thresh=q['threshold'])
    
    dots_list = []
    for r in range(ch):
        for c in range(cw):
            if dithered[r, c] > 0:
                cx = round((c + 0.5) * grid, 1)
                cy = round((r + 0.5) * grid, 1)
                lum = float(down_arr[r, c]) / 255.0
                intensity = round(0.5 + 0.5 * lum, 2)
                rad = round(max(0.4, max_r * (0.65 + 0.35 * lum)), 2)
                alpha = round(0.40 + 0.60 * intensity, 2)
                # Store compact [x, y, radius, alpha, normX, normY]
                dots_list.append([cx, cy, rad, alpha, round(cx / TARGET_W, 3), round(cy / TARGET_H, 3)])
                
    print(f"{q['id']}: {len(dots_list)} dots generated")
    
    out_quotes.append({
        'author': q['author'],
        'quote': q['quote'],
        'imagePath': f"assets/quotes/{q['id']}.png",
        'imageDataUri': data_uri,
        'isSanskrit': q['isSanskrit'],
        'note': q['note'],
        'dots': dots_list
    })

js_code = 'window.MOTIVATIONAL_QUOTES = ' + json.dumps(out_quotes, ensure_ascii=False) + ';\n'
with open('js/quotes-data.js', 'w', encoding='utf-8') as f:
    f.write(js_code)

print('Successfully written js/quotes-data.js, size:', len(js_code))
