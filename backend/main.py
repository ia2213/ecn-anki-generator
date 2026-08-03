from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import io, re, os, math, uuid, subprocess, sys
from datetime import date, timedelta
from typing import Optional
from pathlib import Path

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer, LTChar
except ImportError:
    extract_pages = None

app = FastAPI(title="ECN Anki Generator API", version="3.1.0")

frontend_url = os.getenv("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "https://ecn-anki-generator.vercel.app", "http://localhost:3000", "*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

MAX_FILE_SIZE = 200 * 1024 * 1024
OPENDRAFT_DIR = Path(os.getenv("OPENDRAFT_DIR", "/tmp/opendraft"))
DRAFT_OUTPUTS = Path("/tmp/draft_outputs")
DRAFT_OUTPUTS.mkdir(parents=True, exist_ok=True)


def classify_element(text, font_size):
    text = text.strip()
    if font_size >= 16: return "h1"
    elif font_size >= 13: return "h2"
    elif font_size >= 11: return "h3"
    elif text.startswith(("•", "-", "→", "▸", "*", "·")): return "bullet"
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
                            font_size = char.size
                            break
                    break
                elem_type = classify_element(text, font_size)
                if elem_type in ("h1", "h2", "h3"): current_section = text
                elements.append({"type": elem_type, "content": text, "parent_section": current_section})
    return elements

def generate_anki_cards(elements):
    cards, current_title, bullet_buffer = [], None, []
    def flush_bullets():
        if current_title and len(bullet_buffer) >= 2:
            cards.append({"type": "list", "question": f"Quels sont les éléments de : {current_title} ?", "answer": "\n".join(f"• {b}" for b in bullet_buffer)})
            for bullet in bullet_buffer:
                words = bullet.split()
                if len(words) >= 3:
                    key_word = max(words, key=len)
                    cloze = bullet.replace(key_word, "{{c1::" + key_word + "}}")
                    cards.append({"type": "cloze", "question": f"[{current_title}] " + cloze, "answer": key_word})
    for elem in elements:
        if elem["type"] in ("h1", "h2", "h3"):
            flush_bullets(); bullet_buffer = []; current_title = elem["content"]
        elif elem["type"] in ("bullet", "numbered_list"):
            bullet_buffer.append(elem["content"])
        elif elem["type"] == "paragraph" and current_title and len(elem["content"]) > 60:
            cards.append({"type": "qa", "question": f"[{current_title}] Complétez : {elem['content'][:80]}...", "answer": elem["content"]})
    flush_bullets()
    return cards

def compute_study_plan(total_cards, target_date_str, cards_per_day):
    today = date.today()
    try: target = date.fromisoformat(target_date_str) if target_date_str else today + timedelta(days=90)
    except: target = today + timedelta(days=90)
    days_available = max((target - today).days, 1)
    if cards_per_day and cards_per_day > 0:
        cpd = cards_per_day; days_needed = math.ceil(total_cards / cpd)
        completion_date = (today + timedelta(days=days_needed)).isoformat()
        on_track = days_needed <= days_available
    else:
        cpd = math.ceil(total_cards / days_available); days_needed = days_available
        completion_date = target.isoformat(); on_track = True
    DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    weights = [1.2, 1.2, 1.2, 1.2, 1.2, 0.6, 0.4]; tw = sum(weights)
    weekly_schedule = [{"day": DAYS_FR[i], "cards": max(1, round(cpd * 7 * weights[i] / tw))} for i in range(7)]
    phases = []
    if days_available >= 30:
        p1 = today + timedelta(days=int(days_available * 0.5)); p2 = today + timedelta(days=int(days_available * 0.8))
        phases = [
            {"name": "Phase 1 — Acquisition", "period": f"{today.isoformat()} → {p1.isoformat()}", "new_cards_per_day": round(cpd * 0.7), "review_cards_per_day": round(cpd * 0.3), "tip": "Apprendre de nouveaux contenus, limiter les révisions."},
            {"name": "Phase 2 — Consolidation", "period": f"{p1.isoformat()} → {p2.isoformat()}", "new_cards_per_day": round(cpd * 0.3), "review_cards_per_day": round(cpd * 0.7), "tip": "Réduire les nouvelles cartes, augmenter les révisions espacées."},
            {"name": "Phase 3 — Révision intensive", "period": f"{p2.isoformat()} → {target.isoformat()}", "new_cards_per_day": 0, "review_cards_per_day": cpd, "tip": "100% révisions, aucune nouvelle carte."},
        ]
    else:
        phases = [{"name": "Révision accélérée", "period": f"{today.isoformat()} → {target.isoformat()}", "new_cards_per_day": round(cpd * 0.4), "review_cards_per_day": round(cpd * 0.6), "tip": "Délai court — priorisez les cartes importantes."}]
    return {"total_cards": total_cards, "target_date": target.isoformat(), "days_available": days_available, "cards_per_day": cpd, "days_needed": days_needed, "estimated_completion": completion_date, "on_track": on_track, "weekly_schedule": weekly_schedule, "phases": phases, "anki_settings": {"new_cards_per_day": round(cpd * 0.4), "reviews_per_day": round(cpd * 0.6), "tip": f"Anki : Nouvelles={round(cpd * 0.4)} Révisions={round(cpd * 0.6)}"}}

def extract_topic_from_pdf(elements):
    for elem in elements:
        if elem["type"] in ("h1", "h2") and len(elem["content"]) > 5:
            return elem["content"][:200]
    for elem in elements:
        if elem["type"] == "paragraph" and len(elem["content"]) > 20:
            return elem["content"][:200]
    return "Medical Research Topic"

def ensure_opendraft():
    if not OPENDRAFT_DIR.exists():
        subprocess.run(["git", "clone", "--depth=1", "https://github.com/federicodeponte/opendraft.git", str(OPENDRAFT_DIR)], check=True, capture_output=True, timeout=120)
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(OPENDRAFT_DIR / "requirements.txt"), "-q"], check=True, capture_output=True, timeout=300)

def run_opendraft_background(draft_id: str, topic: str, language: str, level: str, user_gemini_key: Optional[str]):
    out_dir = DRAFT_OUTPUTS / draft_id
    out_dir.mkdir(parents=True, exist_ok=True)
    status_file = out_dir / "status.json"
    import json
    status_file.write_text(json.dumps({"status": "running", "topic": topic}))
    previous_key = os.environ.get("GOOGLE_API_KEY")
    try:
        ensure_opendraft()
        if user_gemini_key:
            os.environ["GOOGLE_API_KEY"] = user_gemini_key
        if str(OPENDRAFT_DIR) not in sys.path:
            sys.path.insert(0, str(OPENDRAFT_DIR))
            sys.path.insert(0, str(OPENDRAFT_DIR / "engine"))
        os.chdir(str(OPENDRAFT_DIR))
        from engine.draft_generator import generate_draft
        pdf_path, docx_path = generate_draft(
            topic=topic,
            language=language,
            academic_level=level,
            output_dir=out_dir / "draft",
            skip_validation=True,
            verbose=False,
        )
        status_file.write_text(json.dumps({"status": "done", "topic": topic, "pdf": str(pdf_path), "docx": str(docx_path)}))
    except Exception as e:
        status_file.write_text(json.dumps({"status": "error", "error": str(e)[:500]}))
    finally:
        if previous_key is not None:
            os.environ["GOOGLE_API_KEY"] = previous_key
        elif "GOOGLE_API_KEY" in os.environ:
            del os.environ["GOOGLE_API_KEY"]

@app.get("/")
def root():
    return {"message": "ECN Anki Generator API v3.1", "status": "running", "max_file_mb": 200}

@app.get("/health")
def health():
    return {"status": "ok"}

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
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 200MB)")
    try:
        elements = extract_pdf_structure(content)
        cards = generate_anki_cards(elements)
        study_plan = compute_study_plan(len(cards), target_date, cards_per_day)
        draft_id = None
        draft_topic = None
        if generate_academic_draft:
            if not x_gemini_api_key:
                raise HTTPException(status_code=400, detail="Ajoutez votre clé Gemini personnelle pour générer le draft académique")
            draft_topic = extract_topic_from_pdf(elements)
            draft_id = str(uuid.uuid4())
            background_tasks.add_task(run_opendraft_background, draft_id, draft_topic, draft_language, draft_level, x_gemini_api_key)
        return JSONResponse({
            "filename": file.filename,
            "elements_count": len(elements),
            "cards_count": len(cards),
            "cards": cards,
            "study_plan": study_plan,
            "draft_id": draft_id,
            "draft_topic": draft_topic,
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur parsing: {str(e)}")

@app.get("/draft-status/{draft_id}")
def draft_status(draft_id: str):
    import json
    status_file = DRAFT_OUTPUTS / draft_id / "status.json"
    if not status_file.exists():
        raise HTTPException(status_code=404, detail="Draft introuvable")
    return json.loads(status_file.read_text())

@app.get("/draft-download/{draft_id}/{format}")
def draft_download(draft_id: str, format: str):
    import json
    status_file = DRAFT_OUTPUTS / draft_id / "status.json"
    if not status_file.exists():
        raise HTTPException(status_code=404, detail="Draft introuvable")
    data = json.loads(status_file.read_text())
    if data.get("status") != "done":
        raise HTTPException(status_code=400, detail="Draft pas encore prêt")
    if format == "pdf":
        path = Path(data["pdf"])
        return FileResponse(path, media_type="application/pdf", filename=path.name)
    if format == "docx":
        path = Path(data["docx"])
        return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename=path.name)
    raise HTTPException(status_code=400, detail="Format invalide (pdf ou docx)")

@app.post("/study-plan")
async def create_study_plan(payload: dict):
    total_cards = payload.get("total_cards", 0)
    if total_cards <= 0:
        raise HTTPException(status_code=400, detail="total_cards doit être > 0")
    return compute_study_plan(total_cards, payload.get("target_date"), payload.get("cards_per_day"))
