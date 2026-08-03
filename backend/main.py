from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import io
import re
import os
from typing import Optional

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer, LTChar
except ImportError:
    extract_pages = None

app = FastAPI(
    title="ECN Anki Generator - PDF Parser",
    description="Extrait et structure le contenu d'un PDF médical pour générer des cartes Anki",
    version="1.0.0"
)

frontend_url = os.getenv("FRONTEND_URL", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "https://ecn-anki-generator.vercel.app", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/")
def root():
    return {"message": "ECN Anki Generator API", "status": "running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 50MB)")

    try:
        elements = extract_pdf_structure(content)
        cards = generate_anki_cards(elements)
        return JSONResponse({
            "filename": file.filename,
            "elements_count": len(elements),
            "cards_count": len(cards),
            "elements": elements,
            "cards": cards
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur parsing: {str(e)}")


@app.post("/generate-cards")
async def generate_cards_from_json(payload: dict):
    elements = payload.get("elements", [])
    if not elements:
        raise HTTPException(status_code=400, detail="Aucun élément fourni")
    cards = generate_anki_cards(elements)
    return {"cards": cards, "count": len(cards)}
