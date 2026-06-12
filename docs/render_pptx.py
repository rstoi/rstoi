#!/usr/bin/env python3
"""Leitor/renderizador de .pptx -> PNG por slide (não depende de LibreOffice).
Lê o arquivo real com python-pptx e desenha formas, texto e imagens com PIL."""
import sys, io, math
from pptx import Presentation
from pptx.util import Emu
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE_TYPE
from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/rstoi/docs/Infraestrutura-IA-setup.com.br.pptx"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "/tmp/slides"
import os; os.makedirs(OUTDIR, exist_ok=True)

prs = Presentation(SRC)
SW = prs.slide_width; SH = prs.slide_height
PXW = 1280
SCALE = PXW / SW
PXH = int(SH * SCALE)

FREG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FBLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
_cache = {}
def font(pt, bold=False, italic=False):
    # itálico real indisponível (só regular/bold); usa o peso correspondente
    px = max(8, int(round(pt * 1.333)))
    key = (px, bold)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(FBLD if bold else FREG, px)
    return _cache[key]

def emu_x(v): return int(v * SCALE)
def emu_y(v): return int(v * SCALE)

def rgb(c):
    try: return (c[0], c[1], c[2])
    except Exception: return None

def shape_fill(shape):
    try:
        f = shape.fill
        if f.type is not None and f.fore_color and f.fore_color.type is not None:
            return rgb(f.fore_color.rgb)
    except Exception:
        pass
    return None

def shape_line(shape):
    try:
        ln = shape.line
        if ln.color and ln.color.type is not None:
            return rgb(ln.color.rgb)
    except Exception:
        pass
    return None

def wrap(draw, text, fnt, maxw):
    words = text.split()
    lines = []; cur = ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines or [""]

def draw_textframe(draw, shape, x, y, w, h):
    tf = shape.text_frame
    anchor = tf.vertical_anchor
    # montar linhas com estilo
    paras = []
    for p in tf.paragraphs:
        runs = []
        for r in p.runs:
            sz = r.font.size.pt if r.font.size else 18
            col = rgb(r.font.color.rgb) if (r.font.color and r.font.color.type is not None) else (40,40,40)
            runs.append((r.text, sz, col, bool(r.font.bold), bool(r.font.italic)))
        if not runs and p.text:
            runs=[(p.text,18,(40,40,40),False,False)]
        align = p.alignment
        paras.append((runs, align))
    # quebrar em linhas visuais
    vis = []  # (segments, align, lineheight)
    for runs, align in paras:
        # concatena runs por palavra preservando estilo; simplificação: wrap por run
        # estratégia: tratar o parágrafo como sequência de segmentos; quebrar quando exceder
        line = []; lw = 0; maxsz = 12
        def flush():
            nonlocal line, lw, maxsz
            if line: vis.append((line, align, int(maxsz*1.333*1.25)))
            line=[]; lw=0; maxsz=12
        for (txt, sz, col, bold, ital) in runs:
            fnt = font(sz, bold, ital)
            txt = txt.replace("\n", " ").replace("\r", " ")
            for j, word in enumerate(txt.split(" ")):
                if word=="" and j>0:
                    continue
                seg = word + " "
                segw = draw.textlength(seg, font=fnt)
                if lw + segw > w and line:
                    flush()
                line.append((seg, fnt, col)); lw += segw; maxsz=max(maxsz,sz)
            # respeitar quebras explícitas (\n viram parágrafos no pptx, raro aqui)
        flush()
    totalh = sum(lh for _,_,lh in vis)
    if anchor == MSO_ANCHOR.MIDDLE: cy = y + max(0,(h-totalh)//2)
    elif anchor == MSO_ANCHOR.BOTTOM: cy = y + max(0,h-totalh)
    else: cy = y
    for segs, align, lh in vis:
        lw = sum(draw.textlength(s, font=f) for s,f,_ in segs)
        if align == PP_ALIGN.CENTER: cx = x + max(0,(w-lw)//2)
        elif align == PP_ALIGN.RIGHT: cx = x + max(0,w-lw)
        else: cx = x
        for s, f, col in segs:
            draw.text((cx, cy), s, font=f, fill=col or (40,40,40))
            cx += draw.textlength(s, font=f)
        cy += lh

def render_slide(slide, idx):
    img = Image.new("RGB", (PXW, PXH), (255,255,255))
    draw = ImageDraw.Draw(img)
    for shape in slide.shapes:
        try:
            x,y = emu_x(shape.left), emu_y(shape.top)
            w,h = emu_x(shape.width), emu_y(shape.height)
        except Exception:
            continue
        if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
            try:
                blob = shape.image.blob
                pic = Image.open(io.BytesIO(blob)).convert("RGBA")
                pic = pic.resize((max(1,w), max(1,h)), Image.LANCZOS)
                img.paste(pic, (x,y), pic)
            except Exception:
                pass
            continue
        # forma com preenchimento/linha
        fill = shape_fill(shape); line = shape_line(shape)
        if fill or line:
            rad = min(14, h//4) if "ROUNDED" in str(shape.shape_type or "") else 0
            try:
                draw.rounded_rectangle([x,y,x+w,y+h], radius=rad,
                                       fill=fill, outline=line,
                                       width=2 if line else 0)
            except Exception:
                draw.rectangle([x,y,x+w,y+h], fill=fill, outline=line)
        if shape.has_text_frame and shape.text_frame.text.strip():
            pad = int(0.05*72*1.333)
            draw_textframe(draw, shape, x+6, y+4, max(10,w-12), max(10,h-8))
    out = f"{OUTDIR}/slide_{idx:02d}.png"
    img.save(out)
    return out

paths=[]
for i, slide in enumerate(prs.slides, 1):
    paths.append(render_slide(slide, i))
print(f"{len(paths)} slides renderizados em {OUTDIR} ({PXW}x{PXH})")

# montar uma folha de contato (grade) para visão geral
cols=3; rows=math.ceil(len(paths)/cols)
tw,th = PXW//3, PXH//3
sheet=Image.new("RGB",(tw*cols, th*rows),(230,233,236))
for k,p in enumerate(paths):
    im=Image.open(p).resize((tw,th), Image.LANCZOS)
    r,c=divmod(k,cols)
    sheet.paste(im,(c*tw, r*th))
sheet.save(f"{OUTDIR}/_contact_sheet.png")
print("contact sheet:", f"{OUTDIR}/_contact_sheet.png")
