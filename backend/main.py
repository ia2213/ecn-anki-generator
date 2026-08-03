from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import io
import re
import os
import math
from datetime import date, timedelta
from typing import Optional

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer, LTChar
except ImportError:
    extract_pages = None

app = FastAPI(
    title="ECN Anki Generator - PDF Parser",
    description="Extrait et structure le contenu d'un PDF médical pour générer des cartes Anki",
    version="2.0.0"
)

frontend_url = os.getenv("FRONTEND_URL", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "https://ecn-anki-generator.vercel.app", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB


def classify_element(text: str, font_size: float) -> str:
    text = text.strip()
    if font_size >= 16:
        return "h1"
    elif font_size >= 13:
        return "h2"
    elif font_size >= 11:
        return "h3"
    elif text.startswith(("•", "-", "→", "▸", "*", "·")):
        return "bullet"
    elif re.match(r'^\d+\.\s', text):
        return "numbered_list"
    elif text.endswith(":") and len(text) < 80:
        return "label"
    else:
        return "paragraph"


def extract_pdf_structure(pdf_bytes: bytes) -> list:
    if extract_pages is None:
        raise HTTPException(status_code=500, detail="pdfminer.six non installé")

    elements = []
    current_section = None

    for page_layout in extract_pages(io.BytesIO(pdf_bytes)):
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                text = element.get_text().strip()
                if not text or len(text) < 3:
                    continue

                font_size = 10.0
                for text_line in element:
                    for char in text_line:
                        if isinstance(char, LTChar):
                            font_size = char.size
                            break
                    break

                elem_type = classify_element(text, font_size)

                if elem_type in ("h1", "h2", "h3"):
                    current_section = text
                    elements.append({"type": elem_type, "content": text, "font_size": round(font_size, 1)})
                elif elem_type in ("bullet", "numbered_list"):
                    clean_text = re.sub(r'^[•\-→▸*·\d+\.\s]+', '', text).strip()
                    elements.append({"type": elem_type, "content": clean_text, "parent_section": current_section})
                else:
                    elements.append({"type": elem_type, "content": text, "parent_section": current_section})

    return elements


def generate_anki_cards(elements: list) -> list:
    cards = []
    current_title = None
    bullet_buffer = []

    def flush_bullets():
        if current_title and len(bullet_buffer) >= 2:
            answer = "\n".join(f"• {b}" for b in bullet_buffer)
            cards.append({
                "type": "list",
                "question": f"Quels sont les éléments de : {current_title} ?",
                "answer": answer
            })
            for bullet in bullet_buffer:
                if len(bullet) > 15:
                    words = bullet.split()
                    if len(words) >= 3:
                        key_word = max(words, key=len)
                        cloze = bullet.replace(key_word, "{{c1::" + key_word + "}}")
                        cards.append({
                            "type": "cloze",
                            "question": f"[{current_title}] " + cloze,
                            "answer": key_word
                        })

    for elem in elements:
        if elem["type"] in ("h1", "h2", "h3"):
            flush_bullets()
            bullet_buffer = []
            current_title = elem["content"]
        elif elem["type"] in ("bullet", "numbered_list"):
            bullet_buffer.append(elem["content"])
        elif elem["type"] == "label" and current_title:
            cards.append({
                "type": "definition",
                "question": f"Qu'est-ce que : {elem['content'].rstrip(':')}",
                "answer": f"→ [Voir cours : {current_title}]"
            })
        elif elem["type"] == "paragraph" and current_title:
            text = elem["content"]
            if len(text) > 60:
                cards.append({
                    "type": "qa",
                    "question": f"[{current_title}] Complétez : {text[:80]}...",
                    "answer": text
                })

    flush_bullets()
    return cards


def compute_study_plan(total_cards: int, target_date_str: Optional[str], cards_per_day: Optional[int]) -> dict:
    today = date.today()

    if target_date_str:
        try:
            target = date.fromisoformat(target_date_str)
        except ValueError:
            target = today + timedelta(days=90)
    else:
        target = today + timedelta(days=90)

    days_available = (target - today).days
    if days_available <= 0:
        days_available = 1

    if cards_per_day and cards_per_day > 0:
        cpd = cards_per_day
        days_needed = math.ceil(total_cards / cpd)
        completion_date = (today + timedelta(days=days_needed)).isoformat()
        on_track = days_needed <= days_available
    else:
        cpd = math.ceil(total_cards / days_available)
        days_needed = days_available
        completion_date = target.isoformat()
        on_track = True

    # Répartition hebdomadaire
    DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    # Charge légère le week-end
    weights = [1.2, 1.2, 1.2, 1.2, 1.2, 0.6, 0.4]
    total_weight = sum(weights)
    weekly_schedule = [
        {"day": DAYS_FR[i], "cards": max(1, round(cpd * 7 * weights[i] / total_weight))}
        for i in range(7)
    ]

    # Phases de révision (nouveaux / révisions)
    new_ratio = 0.4  # 40% nouvelles cartes, 60% révisions
    review_ratio = 0.6

    phases = []
    if days_available >= 30:
        phase1_end = today + timedelta(days=int(days_available * 0.5))
        phase2_end = today + timedelta(days=int(days_available * 0.8))
        phases = [
            {
                "name": "Phase 1 — Acquisition",
                "period": f"{today.isoformat()} → {phase1_end.isoformat()}",
                "new_cards_per_day": round(cpd * 0.7),
                "review_cards_per_day": round(cpd * 0.3),
                "tip": "Apprendre de nouveaux contenus, limiter les révisions au strict minimum."
            },
            {
                "name": "Phase 2 — Consolidation",
                "period": f"{phase1_end.isoformat()} → {phase2_end.isoformat()}",
                "new_cards_per_day": round(cpd * 0.3),
                "review_cards_per_day": round(cpd * 0.7),
                "tip": "Réduire les nouvelles cartes, augmenter les révisions espacées."
            },
            {
                "name": "Phase 3 — Révision intensive",
                "period": f"{phase2_end.isoformat()} → {target.isoformat()}",
                "new_cards_per_day": 0,
                "review_cards_per_day": cpd,
                "tip": "100% révisions, aucune nouvelle carte. Seulement consolider."
            },
        ]
    else:
        phases = [{
            "name": "Révision accélérée",
            "period": f"{today.isoformat()} → {target.isoformat()}",
            "new_cards_per_day": round(cpd * new_ratio),
            "review_cards_per_day": round(cpd * review_ratio),
            "tip": "Délai court — priorisez les cartes les plus importantes."
        }]

    return {
        "total_cards": total_cards,
        "target_date": target.isoformat(),
        "days_available": days_available,
        "cards_per_day": cpd,
        "days_needed": days_needed,
        "estimated_completion": completion_date,
        "on_track": on_track,
        "weekly_schedule": weekly_schedule,
        "phases": phases,
        "anki_settings": {
            "new_cards_per_day": round(cpd * new_ratio),
            "reviews_per_day": round(cpd * review_ratio),
            "graduating_interval": 3,
            "easy_interval": 7,
            "tip": f"Dans Anki : Options du paquet → Nouvelles cartes/jour = {round(cpd * new_ratio)}, Révisions/jour = {round(cpd * review_ratio)}"
        }
    }


@app.get("/")
def root():
    return {"message": "ECN Anki Generator API v2", "status": "running", "max_file_size_mb": 200}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-pdf")
async def parse_pdf(
    file: UploadFile = File(...),
    target_date: Optional[str] = None,
    cards_per_day: Optional[int] = None
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux (max {MAX_FILE_SIZE // 1024 // 1024}MB)")

    try:
        elements = extract_pdf_structure(content)
        cards = generate_anki_cards(elements)
        study_plan = compute_study_plan(len(cards), target_date, cards_per_day)
        return JSONResponse({
            "filename": file.filename,
            "elements_count": len(elements),
            "cards_count": len(cards),
            "elements": elements,
            "cards": cards,
            "study_plan": study_plan
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur parsing: {str(e)}")


@app.post("/study-plan")
async def create_study_plan(payload: dict):
    total_cards = payload.get("total_cards", 0)
    target_date = payload.get("target_date")
    cards_per_day = payload.get("cards_per_day")
    if total_cards <= 0:
        raise HTTPException(status_code=400, detail="total_cards doit être > 0")
    plan = compute_study_plan(total_cards, target_date, cards_per_day)
    return plan
