from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import io, re, os, math, uuid, subprocess, sys, json, shutil, hashlib
from datetime import date, timedelta
from typing import Optional, List, Dict
from pathlib import Path

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer, LTChar
except ImportError:
    extract_pages = None

app = FastAPI(title="ECN Anki Generator API", version="5.0.0")
frontend_url = os.getenv("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "https://ecn-anki-generator.vercel.app", "http://localhost:3000", "*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

MAX_FILE_SIZE = 200 * 1024 * 1024
DATA_DIR = Path("/tmp/ecn_data")
BOOKS_DIR = DATA_DIR / "books"
DRAFT_OUTPUTS = DATA_DIR / "drafts"
for d in [DATA_DIR, BOOKS_DIR, DRAFT_OUTPUTS]: d.mkdir(parents=True, exist_ok=True)

def classify_element(text, font_size):
    text = text.strip()
    if font_size >= 16: return "h1"
    elif font_size >= 13: return "h2"
    elif font_size >= 11: return "h3"
    elif text.startswith(("•","-","→","▸","*","·")): return "bullet"
    elif re.match(r'^\d+\.\s', text): return "numbered_list"
    elif text.endswith(":") and len(text) < 80: return "label"
    else: return "paragraph"

def extract_pdf_structure(pdf_bytes):
    if extract_pages is None:
        raise HTTPException(status_code=500, detail="pdfminer.six non installé")
    elements, current_section = [], None
    for page_num, page_layout in enumerate(extract_pages(io.BytesIO(pdf_bytes)), start=1):
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                text = element.get_text().strip()
                if not text or len(text) < 3: continue
                font_size = 10.0
                for line in element:
                    for char in line:
                        if isinstance(char, LTChar): font_size = char.size; break
                    break
                elem_type = classify_element(text, font_size)
                if elem_type in ("h1","h2","h3"): current_section = text
                elements.append({"type": elem_type, "content": text, "parent_section": current_section, "page": page_num, "font_size": round(font_size, 1)})
    return elements

def analyze_document(elements, filename: str, file_size: int, uploaded_by: Optional[str] = None):
    headings = [e for e in elements if e['type'] in ('h1','h2','h3')]
    bullets = [e for e in elements if e['type'] in ('bullet','numbered_list')]
    paragraphs = [e for e in elements if e['type'] == 'paragraph']
    pages = sorted(list(set(e.get('page', 1) for e in elements)))
    page_count = len(pages)
    top_sections = []
    counts_by_section: Dict[str, int] = {}
    for e in elements:
        section = e.get('parent_section') or 'Sans section'
        counts_by_section[section] = counts_by_section.get(section, 0) + 1
    top_sections = [{"title": k, "elements": v} for k, v in sorted(counts_by_section.items(), key=lambda x: x[1], reverse=True)[:8]]
    sample_headings = [h['content'] for h in headings[:10]]
    text_blocks = [e['content'] for e in elements[:300] if len(e['content']) > 20]
    words = re.findall(r'\b\w+\b', ' '.join(text_blocks).lower())
    stop = {'de','la','le','les','des','et','ou','un','une','du','dans','sur','pour','par','avec','sans','est','sont','au','aux','en','que','qui','ce','cette','ces','plus','moins','chez'}
    freq: Dict[str, int] = {}
    for w in words:
        if len(w) < 4 or w in stop: continue
        freq[w] = freq.get(w, 0) + 1
    keywords = [w for w, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:20]]
    estimated_quality_score = min(100, max(35, int((len(headings)*2 + len(bullets) + len(paragraphs)*0.4 + page_count*1.5))))
    return {
        "filename": filename,
        "file_size_bytes": file_size,
        "uploaded_by": uploaded_by or "anonymous",
        "pages": page_count,
        "headings": len(headings),
        "bullets": len(bullets),
        "paragraphs": len(paragraphs),
        "top_sections": top_sections,
        "sample_headings": sample_headings,
        "keywords": keywords,
        "estimated_quality_score": estimated_quality_score,
        "summary": {
            "document_type": "structured_course" if len(headings) >= 3 and len(bullets) >= 8 else "document",
            "structure_level": "high" if len(headings) >= 8 else "medium" if len(headings) >= 3 else "low",
            "flashcard_potential": "high" if estimated_quality_score >= 70 else "medium" if estimated_quality_score >= 50 else "basic"
        }
    }

def generate_anki_cards(elements, source_meta=None):
    cards, current_title, bullet_buffer = [], None, []
    source_meta = source_meta or {}
    def attach_source(card, source_text=None, section=None, page=None):
        card["source"] = {
            "book_id": source_meta.get("book_id"),
            "title": source_meta.get("title"),
            "filename": source_meta.get("filename"),
            "uploaded_by": source_meta.get("uploaded_by", "anonymous"),
            "page": page,
            "section": section,
            "excerpt": (source_text or "")[:280]
        }
        return card
    def flush_bullets():
        nonlocal cards, bullet_buffer, current_title
        if current_title and len(bullet_buffer) >= 2:
            joined = "\n".join(f"• {b['content']}" for b in bullet_buffer)
            page = bullet_buffer[0].get('page')
            cards.append(attach_source({"type":"list","question":f"Quels sont les éléments de : {current_title} ?","answer":joined}, joined, current_title, page))
            for bullet in bullet_buffer:
                words = bullet['content'].split()
                if len(words) >= 3:
                    key_word = max(words, key=len)
                    cloze = bullet['content'].replace(key_word, "{{c1::"+key_word+"}}", 1)
                    cards.append(attach_source({"type":"cloze","question":f"[{current_title}] "+cloze,"answer":key_word}, bullet['content'], current_title, bullet.get('page')))
    for elem in elements:
        if elem["type"] in ("h1","h2","h3"):
            flush_bullets(); bullet_buffer=[]; current_title=elem["content"]
        elif elem["type"] in ("bullet","numbered_list"):
            bullet_buffer.append(elem)
        elif elem["type"]=="paragraph" and current_title and len(elem["content"])>60:
            cards.append(attach_source({"type":"qa","question":f"[{current_title}] Complétez : {elem['content'][:80]}...","answer":elem["content"]}, elem['content'], current_title, elem.get('page')))
    flush_bullets()
    return cards

def compute_study_plan(total_cards, target_date_str, cards_per_day):
    today = date.today()
    try: target = date.fromisoformat(target_date_str) if target_date_str else today + timedelta(days=90)
    except: target = today + timedelta(days=90)
    days_available = max((target - today).days, 1)
    if cards_per_day and cards_per_day > 0:
        cpd = cards_per_day; days_needed = math.ceil(total_cards / cpd); completion_date = (today + timedelta(days=days_needed)).isoformat(); on_track = days_needed <= days_available
    else:
        cpd = math.ceil(total_cards / days_available); days_needed = days_available; completion_date = target.isoformat(); on_track = True
    return {"total_cards":total_cards,"target_date":target.isoformat(),"days_available":days_available,"cards_per_day":cpd,"days_needed":days_needed,"estimated_completion":completion_date,"on_track":on_track}

def get_index():
    idx = BOOKS_DIR / "index.json"
    if not idx.exists(): return []
    return json.loads(idx.read_text())

def save_index(index):
    (BOOKS_DIR / "index.json").write_text(json.dumps(index, ensure_ascii=False))

@app.get("/")
def root(): return {"message":"ECN Anki Generator API v5","status":"running"}

@app.get("/health")
def health(): return {"status":"ok"}

@app.post("/community/books")
async def community_upload_book(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    category: Optional[str] = "Général",
    contributor_name: Optional[str] = "anonymous",
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF uniquement")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux")
    checksum = hashlib.sha256(content).hexdigest()
    existing = get_index()
    for b in existing:
        if b.get('checksum') == checksum:
            return JSONResponse({"duplicate": True, "message": "Document déjà ajouté", "book": b})
    book_id = str(uuid.uuid4())
    book_title = title or file.filename.replace('.pdf','')
    book_dir = BOOKS_DIR / book_id
    book_dir.mkdir(parents=True, exist_ok=True)
    (book_dir / 'original.pdf').write_bytes(content)
    elements = extract_pdf_structure(content)
    analysis = analyze_document(elements, file.filename, len(content), contributor_name)
    source_meta = {"book_id": book_id, "title": book_title, "filename": file.filename, "uploaded_by": contributor_name}
    cards = generate_anki_cards(elements, source_meta=source_meta)
    for i, c in enumerate(cards):
        c['id'] = f"{book_id}_{i}"
        c['book_id'] = book_id
    (book_dir / 'cards.json').write_text(json.dumps(cards, ensure_ascii=False))
    (book_dir / 'analysis.json').write_text(json.dumps(analysis, ensure_ascii=False))
    meta = {
        "id": book_id,
        "title": book_title,
        "category": category,
        "filename": file.filename,
        "cards_count": len(cards),
        "created_at": date.today().isoformat(),
        "uploaded_by": contributor_name,
        "checksum": checksum,
        "analysis": analysis,
        "status": "published"
    }
    (book_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))
    existing.append(meta)
    save_index(existing)
    return {"book": meta, "analysis": analysis, "cards_count": len(cards)}

@app.get("/library")
def get_library():
    return get_index()

@app.get("/library/{book_id}/cards")
def get_book_cards(book_id: str):
    cards_file = BOOKS_DIR / book_id / 'cards.json'
    if not cards_file.exists(): raise HTTPException(status_code=404, detail='Livre introuvable')
    return json.loads(cards_file.read_text())

@app.get("/library/{book_id}/analysis")
def get_book_analysis(book_id: str):
    analysis_file = BOOKS_DIR / book_id / 'analysis.json'
    if not analysis_file.exists(): raise HTTPException(status_code=404, detail='Analyse introuvable')
    return json.loads(analysis_file.read_text())

@app.get("/library/all-cards")
def get_all_cards(category: Optional[str] = None):
    index = get_index()
    all_cards = []
    for book in index:
        if category and book.get('category') != category: continue
        cards_file = BOOKS_DIR / book['id'] / 'cards.json'
        if cards_file.exists():
            all_cards.extend(json.loads(cards_file.read_text()))
    return all_cards

@app.post('/parse-pdf')
async def parse_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...), target_date: Optional[str] = None, cards_per_day: Optional[int] = None):
    if not file.filename.endswith('.pdf'): raise HTTPException(status_code=400, detail='PDF uniquement')
    content = await file.read()
    if len(content) > MAX_FILE_SIZE: raise HTTPException(status_code=413, detail='Fichier trop volumineux')
    elements = extract_pdf_structure(content)
    analysis = analyze_document(elements, file.filename, len(content), 'personal')
    cards = generate_anki_cards(elements, source_meta={"title": file.filename.replace('.pdf',''), "filename": file.filename, "uploaded_by": 'personal'})
    study_plan = compute_study_plan(len(cards), target_date, cards_per_day)
    return JSONResponse({"filename":file.filename,"elements_count":len(elements),"cards_count":len(cards),"cards":cards,"analysis":analysis,"study_plan":study_plan})