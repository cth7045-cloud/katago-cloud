# 사이트 앱 아이콘 만들기: src/light.png·src/dark.png(1254×1254, 둥근 사각형 그림) → out/ 에 크기별 PNG. 사용: python3 make_icons.py (Pillow·numpy 필요)
import numpy as np, os
from PIL import Image, ImageDraw, ImageFilter
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out") + "/"; os.makedirs(OUT, exist_ok=True)
# 둥근 사각형(타일)의 경계: 받은 그림에서 잰 값, 테두리·그림자를 빼려고 조금 안쪽
HERE = os.path.dirname(os.path.abspath(__file__))
TILES = {"light": (os.path.join(HERE, "src/light.png"), (92, 82, 1162, 1150)), "dark": (os.path.join(HERE, "src/dark.png"), (122, 136, 1133, 1114))}

def rounded(size, r, inset=0):   # inset: 가장자리에서 이만큼 안쪽(MinFilter는 그림 끝에서 줄어들지 않음)
    m = Image.new("L", size, 0); ImageDraw.Draw(m).rounded_rectangle((inset, inset, size[0] - 1 - inset, size[1] - 1 - inset), max(0, r - inset), fill=255)
    return m

def blur(arr, r, edge=False):
    if edge:   # 그림 바깥을 검정이 아니라 가장자리 색으로 보고 흐림(가장자리가 어두워지지 않게)
        p = int(r * 3); a = np.pad(arr, p, mode="edge")
        return blur(a, r)[p:-p, p:-p]
    return np.asarray(Image.fromarray(np.uint8(np.clip(arr, 0, 255))).filter(ImageFilter.GaussianBlur(r)), np.float64)

def extend(rgb, mask, R=70, feather=10):
    """mask 바깥을 안쪽 가장자리 색이 번진 부드러운 색으로 채우고, 경계는 흐리게 섞음."""
    a = np.asarray(mask, np.float64) / 255
    c = np.asarray(rgb.convert("RGB"), np.float64)
    def field(r):
        den = blur(a * 255, r) / 255
        return np.stack([blur(c[..., i] * a, r) for i in range(3)], -1) / np.maximum(den, 1e-4)[..., None], den
    near, dn = field(R); far, _ = field(R * 4)
    fill = np.where((dn > .03)[..., None], near, far)
    fill = np.stack([blur(fill[..., i], R / 2, True) for i in range(3)], -1)   # 가까운 곳·먼 곳 경계도 부드럽게
    soft = np.asarray(Image.fromarray(np.uint8(a * 255)).filter(ImageFilter.MinFilter(2 * (feather // 2) + 1)).filter(ImageFilter.GaussianBlur(feather / 2)), np.float64)[..., None] / 255
    return Image.fromarray(np.uint8(np.clip(c * soft + fill * (1 - soft), 0, 255)))

def full_bleed(name):
    src, box = TILES[name]
    im = Image.open(src).convert("RGB").crop(box); w, h = im.size; s = max(w, h)
    canvas = Image.new("RGB", (s, s)); canvas.paste(im, ((s - w) // 2, (s - h) // 2))
    m = Image.new("L", (s, s), 0)
    m.paste(rounded((w, h), int(min(w, h) * .2), 20), ((s - w) // 2, (s - h) // 2))
    return extend(canvas, m)

for name in TILES:
    F = full_bleed(name)
    F.resize((180, 180), Image.LANCZOS).save(f"{OUT}icon-{name}-180.png")
    for n in (32, 192, 512):   # 탭·일반 아이콘: 둥근 사각형, 바깥 투명
        t = F.resize((n, n), Image.LANCZOS).convert("RGBA"); t.putalpha(rounded((n, n), round(n * .225))); t.save(f"{OUT}icon-{name}-{n}.png")
    # maskable: 가장자리까지 배경, 그림은 가운데로 줄여 각 변 여백 약 20%
    k = 392; o = (512 - k) // 2
    big = Image.new("RGB", (512, 512)); big.paste(F.resize((k, k), Image.LANCZOS), (o, o))
    m = Image.new("L", (512, 512), 0); m.paste(rounded((k, k), int(k * .2), 8), (o, o))
    extend(big, m, 40, 8).save(f"{OUT}icon-{name}-512-maskable.png")

# 점검용 한 장
sheet = Image.new("RGB", (1500, 760), (128, 128, 128)); x = 20
for i, name in enumerate(TILES):
    y = 20 + i * 370
    for f, sz in [(f"{OUT}icon-{name}-512.png", 256), (f"{OUT}icon-{name}-180.png", 180), (f"{OUT}icon-{name}-512-maskable.png", 256)]:
        im = Image.open(f).convert("RGBA").resize((sz, sz), Image.LANCZOS); sheet.paste(im, (x, y), im); x += sz + 30
    mk = Image.open(f"{OUT}icon-{name}-512-maskable.png").resize((256, 256)); c = Image.new("L", (256, 256), 0); ImageDraw.Draw(c).ellipse((0, 0, 255, 255), fill=255)
    sheet.paste(mk, (x, y), c); x += 286
    for n in (32, 192):
        im = Image.open(f"{OUT}icon-{name}-{n}.png").convert("RGBA"); sheet.paste(im, (x, y), im); x += n + 30
    x = 20
sheet.save(OUT + "check.png"); print("ok")
