# -*- coding: utf-8 -*-
# Renders story-script.md -> /tmp/script.html (styled) for PDF printing.
import re, html
md=open('story-script.md',encoding='utf-8').read()
def inline(s):
    s=html.escape(s); s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
    s=re.sub(r'\*\*([^*]+?)\*\*',r'<strong>\1</strong>',s)
    s=re.sub(r'(?<!\w)_([^_]+?)_(?!\w)',r'<em>\1</em>',s); return s
out=[];para=[];quote=[]
def fp():
    global para
    if para: out.append("<p>"+"<br>".join(inline(l) for l in para)+"</p>"); para=[]
def fq():
    global quote
    if quote: out.append("<blockquote>"+"<br>".join(inline(l) for l in quote)+"</blockquote>"); quote=[]
for raw in md.split("\n"):
    st=raw.strip()
    if st.startswith("> "): fp(); quote.append(st[2:]); continue
    fq()
    if not st: fp(); continue
    if st=="---": fp(); out.append("<hr>"); continue
    m=re.match(r'^(#{1,3})\s+(.*)$',st)
    if m: fp(); lvl=len(m.group(1)); out.append("<h%d>%s</h%d>"%(lvl,inline(m.group(2)),lvl)); continue
    if re.match(r'^(\d+\.|-)\s',st): fp(); out.append('<p class="li">'+inline(st)+'</p>'); continue
    para.append(st)
fp(); fq()
css="@page{size:Letter;margin:18mm 16mm}body{font:11pt/1.5 'Iowan Old Style',Georgia,serif;color:#1a1a18;max-width:46rem;margin:0 auto}h1{font-size:22pt;border-bottom:2px solid #6b8f9e;padding-bottom:.3em}h2{font-size:15pt;color:#3d6170;margin-top:1.6em;border-bottom:1px solid #cddde3;padding-bottom:.15em;page-break-after:avoid}h3{font-size:12pt;color:#6b6258;margin-top:1.1em;page-break-after:avoid}p{margin:.45em 0}p.li{margin:.3em 0 .3em 1.2em}code{background:#f0ece3;padding:0 .25em;border-radius:3px;font-size:.9em}blockquote{margin:.4em 0 .4em 1em;padding:.1em 0 .1em .9em;border-left:3px solid #c4a882;color:#4a463e;font-style:italic}hr{border:none;border-top:1px solid #ddd;margin:1.4em 0}em{color:#5a5448}"
open('/tmp/script.html','w',encoding='utf-8').write("<!doctype html><meta charset=utf-8><style>%s</style>%s"%(css,"\n".join(out)))
print("html written")
