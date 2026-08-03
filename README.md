# 🧠 ECN Anki Generator

Plateforme permettant aux étudiants en médecine (ECN/EDN) de transformer leurs PDFs en cartes Anki de révision.

## 🌐 Live
- **Frontend** : https://ecn-anki-generator.vercel.app
- **Backend** : à déployer sur Render (voir ci-dessous)

## Stack Technique
- **Frontend** : Next.js 14 (App Router) + Tailwind CSS → Vercel
- **Auth** : NextAuth + Google OAuth (Drive scope)
- **Backend PDF** : FastAPI (Python) + pdfminer.six
- **Export** : Format texte Anki (.txt)

## Structure
```
.
├── frontend/          # Next.js app
│   ├── app/
│   │   ├── page.tsx           # Landing page
│   │   ├── dashboard/         # Dashboard upload + cartes
│   │   └── api/               # NextAuth + Drive API routes
│   └── package.json
└── backend/           # FastAPI Python
    ├── main.py
    ├── requirements.txt
    └── render.yaml    # Déploiement Render
```

## 🚀 Démarrage local

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # puis remplir les valeurs
npm run dev
```

## ⚙️ Variables d'environnement

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

## 🔧 Déploiement Backend sur Render
1. Créer un compte sur https://render.com
2. New → Web Service → connecter ce repo
3. Root directory : `backend`
4. Build command : `pip install -r requirements.txt`
5. Start command : `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Copier l'URL publique dans `NEXT_PUBLIC_API_URL` sur Vercel

## 🔑 Google Cloud Setup
1. https://console.cloud.google.com → Nouveau projet
2. APIs & Services → Enable → Google Drive API
3. Credentials → OAuth 2.0 Client IDs
4. Authorized redirect URIs : `https://ecn-anki-generator.vercel.app/api/auth/callback/google`
