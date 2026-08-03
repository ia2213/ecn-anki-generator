from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import io, re, os, math, uuid, subprocess, sys, json, shutil
from datetime import date, timedelta
from typing import Optional, List
from pathlib import Path

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer, LTChar
except ImportError:
    extract_pages = None

app = FastAPI(title="ECN Anki Generator API", version="4.0.0")

frontend_url = os.getenv("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "https://ecn-anki-generator.vercel.app", "http://localhost:3000", "*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

MAX_FILE_SIZE = 200 * 1024 * 1024
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "ecn-admin-2026")
DATA_DIR = Path("/tmp/ecn_data")
BOOKS_DIR = DATA_DIR / "books"
CARDS_DIR = DATA_DIR / "cards"
DRAFT_OUTPUTS = DATA_DIR / "drafts"
OPENDRAFT_DIR = Path(os.getenv("OPENDRAFT_DIR", "/tmp/opendraft"))

for d in [DATA_DIR, BOOKS_DIR, CARDS_DIR, DRAFT_OUTPUTS]:
    d.mkdir(parents=True, exist_ok=True)

# ── helpers ───────────────────────────────────────────────────────────────────
def is_admin(authorization: Optional[str] = Header(default=None)) -> bool:
    if authorization and authorization.replace("Bearer ", "") == ADMIN_SECRET:
        return True
    return False

def require_admin(authorization: Optional[str] = Header(default=None)):
    if not authorization or authorization.replace("Bearer ", "") != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Admin only")

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
    for page_layout in extract_pages(io.BytesIO(pdf_bytes)):
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                text = element.get_text().strip()
                if not text or len(text) < 3: continue
                font_size = 10.0
                for line in element:
                    for char in line:
                        if isinstance(char, LTChar):
                            font_size = char.size; break
                    break
                elem_type = classify_element(text, font_size)
                if elem_type in ("h1","h2","h3"): current_section = text
                elements.append({"type": elem_type, "content": text, "parent_section": current_section})
    return elements

def generate_anki_cards(elements):
    cards, current_title, bullet_buffer = [], None, []
    def flush_bullets():
        if current_title and len(bullet_buffer) >= 2:
            cards.append({"type":"list","question":f"Quels sont les éléments de : {current_title} ?","answer":"\n".join(f"• {b}" for b in bullet_buffer)})
            for bullet in bullet_buffer:
                words = bullet.split()
                if len(words) >= 3:
                    key_word = max(words, key=len)
                    cloze = bullet.replace(key_word, "{{c1::"+key_word+"}}")
                    cards.append({"type":"cloze","question":f"[{current_title}] "+cloze,"answer":key_word})
    for elem in elements:
        if elem["type"] in ("h1","h2","h3"): flush_bullets(); bullet_buffer=[]; current_title=elem["content"]
        elif elem["type"] in ("bullet","numbered_list"): bullet_buffer.append(elem["content"])
        elif elem["type"]=="paragraph" and current_title and len(elem["content"])>60:
            cards.append({"type":"qa","question":f"[{current_title}] Complétez : {elem['content'][:80]}...","answer":elem["content"]})
    flush_bullets()
    return cards

def compute_study_plan(total_cards, target_date_str, cards_per_day):
    today = date.today()
    try: target = date.fromisoformat(target_date_str) if target_date_str else today + timedelta(days=90)
    except: target = today + timedelta(days=90)
    days_available = max((target - today).days, 1)
    if cards_per_day and cards_per_day > 0:
        cpd = cards_per_day; days_needed = math.ceil(total_cards / cpd)
        completion_date = (today + timedelta(days=days_needed)).isoformat(); on_track = days_needed <= days_available
    else:
        cpd = math.ceil(total_cards / days_available); days_needed = days_available; completion_date = target.isoformat(); on_track = True
    DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"]
    weights = [1.2,1.2,1.2,1.2,1.2,0.6,0.4]; tw = sum(weights)
    weekly_schedule = [{"day":DAYS_FR[i],"cards":max(1,round(cpd*7*weights[i]/tw))} for i in range(7)]
    phases = []
    if days_available >= 30:
        p1 = today+timedelta(days=int(days_available*0.5)); p2 = today+timedelta(days=int(days_available*0.8))
        phases = [
            {"name":"Phase 1 — Acquisition","period":f"{today.isoformat()} → {p1.isoformat()}","new_cards_per_day":round(cpd*0.7),"review_cards_per_day":round(cpd*0.3),"tip":"Apprendre de nouveaux contenus."},
            {"name":"Phase 2 — Consolidation","period":f"{p1.isoformat()} → {p2.isoformat()}","new_cards_per_day":round(cpd*0.3),"review_cards_per_day":round(cpd*0.7),"tip":"Révisions espacées."},
            {"name":"Phase 3 — Révision intensive","period":f"{p2.isoformat()} → {target.isoformat()}","new_cards_per_day":0,"review_cards_per_day":cpd,"tip":"100% révisions."},
        ]
    else:
        phases = [{"name":"Révision accélérée","period":f"{today.isoformat()} → {target.isoformat()}","new_cards_per_day":round(cpd*0.4),"review_cards_per_day":round(cpd*0.6),"tip":"Délai court."}]
    return {"total_cards":total_cards,"target_date":target.isoformat(),"days_available":days_available,"cards_per_day":cpd,"days_needed":days_needed,"estimated_completion":completion_date,"on_track":on_track,"weekly_schedule":weekly_schedule,"phases":phases,"anki_settings":{"new_cards_per_day":round(cpd*0.4),"reviews_per_day":round(cpd*0.6),"tip":f"Anki : Nouvelles={round(cpd*0.4)} Révisions={round(cpd*0.6)}"}}

def slugify(text):
    return re.sub(r'[^\w]+','_', text.lower().strip())[:40]

# ── ROUTES BASE ──────────────────────────────────────────────────────────────
@app.get("/")
def root(): return {"message":"ECN Anki Generator API v4","status":"running"}

@app.get("/health")
def health(): return {"status":"ok"}

# ── ADMIN: upload book ─────────────────────────────────────────────────────
@app.post("/admin/books")
async def admin_upload_book(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    category: Optional[str] = "Général",
    authorization: Optional[str] = Header(default=None),
):
    require_admin(authorization)
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF uniquement")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux")
    book_id = str(uuid.uuid4())
    book_title = title or file.filename.replace(".pdf","")
    book_dir = BOOKS_DIR / book_id
    book_dir.mkdir()
    (book_dir/"original.pdf").write_bytes(content)
    elements = extract_pdf_structure(content)
    cards = generate_anki_cards(elements)
    for i,c in enumerate(cards): c["id"] = f"{book_id}_{i}"; c["book_id"] = book_id
    (book_dir/"cards.json").write_text(json.dumps(cards, ensure_ascii=False))
    meta = {"id":book_id,"title":book_title,"category":category,"filename":file.filename,"cards_count":len(cards),"created_at":date.today().isoformat()}
    (book_dir/"meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    index = json.loads((BOOKS_DIR/"index.json").read_text()) if (BOOKS_DIR/"index.json").exists() else []
    index.append(meta)
    (BOOKS_DIR/"index.json").write_text(json.dumps(index, ensure_ascii=False))
    return meta

@app.delete("/admin/books/{book_id}")
def admin_delete_book(book_id: str, authorization: Optional[str] = Header(default=None)):
    require_admin(authorization)
    book_dir = BOOKS_DIR / book_id
    if not book_dir.exists(): raise HTTPException(status_code=404, detail="Livre introuvable")
    shutil.rmtree(book_dir)
    index = json.loads((BOOKS_DIR/"index.json").read_text()) if (BOOKS_DIR/"index.json").exists() else []
    index = [b for b in index if b["id"] != book_id]
    (BOOKS_DIR/"index.json").write_text(json.dumps(index, ensure_ascii=False))
    return {"deleted":book_id}

# ── PUBLIC: library & cards ───────────────────────────────────────────────
@app.get("/library")
def get_library():
    if not (BOOKS_DIR/"index.json").exists(): return []
    return json.loads((BOOKS_DIR/"index.json").read_text())

@app.get("/library/{book_id}/cards")
def get_book_cards(book_id: str):
    cards_file = BOOKS_DIR / book_id / "cards.json"
    if not cards_file.exists(): raise HTTPException(status_code=404, detail="Livre introuvable")
    return json.loads(cards_file.read_text())

@app.get("/library/all-cards")
def get_all_cards(category: Optional[str] = None):
    if not (BOOKS_DIR/"index.json").exists(): return []
    index = json.loads((BOOKS_DIR/"index.json").read_text())
    all_cards = []
    for book in index:
        if category and book.get("category") != category: continue
        cards_file = BOOKS_DIR / book["id"] / "cards.json"
        if cards_file.exists():
            all_cards.extend(json.loads(cards_file.read_text()))
    return all_cards

# ── PARSE PDF (personal upload, unchanged) ───────────────────────────────
@app.post("/parse-pdf")
async def parse_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target_date: Optional[str] = None,
    cards_per_day: Optional[int] = None,
    generate_academic_draft: bool = False,
    draft_language: str = "fr",
    draft_level: str = "research_paper",
    x_gemini_api_key: Optional[str] = Header(default=None),
):
    if not file.filename.endswith(".pdf"): raise HTTPException(status_code=400, detail="PDF uniquement")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE: raise HTTPException(status_code=413, detail="Fichier trop volumineux")
    try:
        elements = extract_pdf_structure(content)
        cards = generate_anki_cards(elements)
        study_plan = compute_study_plan(len(cards), target_date, cards_per_day)
        draft_id = None; draft_topic = None
        if generate_academic_draft:
            if not x_gemini_api_key: raise HTTPException(status_code=400, detail="Clé Gemini requise")
            draft_topic = next((e["content"][:200] for e in elements if e["type"] in ("h1","h2") and len(e["content"])>5), "Medical Topic")
            draft_id = str(uuid.uuid4())
            background_tasks.add_task(_run_opendraft, draft_id, draft_topic, draft_language, draft_level, x_gemini_api_key)
        return JSONResponse({"filename":file.filename,"elements_count":len(elements),"cards_count":len(cards),"cards":cards,"study_plan":study_plan,"draft_id":draft_id,"draft_topic":draft_topic})
    except HTTPException: raise
    except Exception as e: raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

def _run_opendraft(draft_id, topic, language, level, gemini_key):
    out_dir = DRAFT_OUTPUTS / draft_id; out_dir.mkdir(parents=True, exist_ok=True)
    sf = out_dir / "status.json"; sf.write_text(json.dumps({"status":"running","topic":topic}))
    prev = os.environ.get("GOOGLE_API_KEY")
    try:
        if not (Path("/tmp/opendraft")).exists():
            subprocess.run(["git","clone","--depth=1","https://github.com/federicodeponte/opendraft.git","/tmp/opendraft"],check=True,capture_output=True,timeout=120)
            subprocess.run([sys.executable,"-m","pip","install","-r","/tmp/opendraft/requirements.txt","-q"],check=True,capture_output=True,timeout=300)
        os.environ["GOOGLE_API_KEY"] = gemini_key
        if "/tmp/opendraft" not in sys.path: sys.path.insert(0,"/tmp/opendraft"); sys.path.insert(0,"/tmp/opendraft/engine")
        os.chdir("/tmp/opendraft")
        from engine.draft_generator import generate_draft
        pdf_path, docx_path = generate_draft(topic=topic,language=language,academic_level=level,output_dir=out_dir/"draft",skip_validation=True,verbose=False)
        sf.write_text(json.dumps({"status":"done","topic":topic,"pdf":str(pdf_path),"docx":str(docx_path)}))
    except Exception as e:
        sf.write_text(json.dumps({"status":"error","error":str(e)[:500]}))
    finally:
        if prev is not None: os.environ["GOOGLE_API_KEY"] = prev
        elif "GOOGLE_API_KEY" in os.environ: del os.environ["GOOGLE_API_KEY"]

@app.get("/draft-status/{draft_id}")
def draft_status(draft_id: str):
    sf = DRAFT_OUTPUTS / draft_id / "status.json"
    if not sf.exists(): raise HTTPException(status_code=404)
    return json.loads(sf.read_text())

@app.get("/draft-download/{draft_id}/{fmt}")
def draft_download(draft_id: str, fmt: str):
    sf = DRAFT_OUTPUTS / draft_id / "status.json"
    if not sf.exists(): raise HTTPException(status_code=404)
    data = json.loads(sf.read_text())
    if data.get("status") != "done": raise HTTPException(status_code=400, detail="Pas encore prêt")
    if fmt == "pdf": path = Path(data["pdf"]); return FileResponse(path, media_type="application/pdf", filename=path.name)
    if fmt == "docx": path = Path(data["docx"]); return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename=path.name)
    raise HTTPException(status_code=400, detail="Format invalide")
