'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Card {
  id: string; book_id?: string; type: string;
  question: string; answer: string;
  // SRS fields (stored locally)
  due?: string; interval?: number; ease?: number; reps?: number;
}
interface CardProgress { id: string; due: string; interval: number; ease: number; reps: number; last_result: string }

const SRS_KEY = 'ecn_srs_v1'

function loadSRS(): Record<string,CardProgress> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(SRS_KEY) || '{}') } catch { return {} }
}
function saveSRS(data: Record<string,CardProgress>) {
  localStorage.setItem(SRS_KEY, JSON.stringify(data))
}

// SM-2 algorithm
function srsUpdate(card: CardProgress, quality: 0|1|2|3): CardProgress {
  const today = new Date().toISOString().split('T')[0]
  let { interval, ease, reps } = card
  if (quality < 2) { interval = 1; reps = 0 }
  else {
    if (reps === 0) interval = 1
    else if (reps === 1) interval = 3
    else interval = Math.round(interval * ease)
    reps += 1
    ease = Math.max(1.3, ease + 0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02))
  }
  const due = new Date(Date.now() + interval * 86400000).toISOString().split('T')[0]
  return { ...card, interval, ease, reps, due, last_result: quality >= 2 ? 'good' : 'again' }
}

function RevisionContent() {
  const searchParams = useSearchParams()
  const bookId = searchParams.get('book')
  const [allCards, setAllCards] = useState<Card[]>([])
  const [sessionCards, setSessionCards] = useState<Card[]>([])
  const [current, setCurrent] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [srs, setSrs] = useState<Record<string,CardProgress>>({})
  const [sessionDone, setSessionDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ good:0, hard:0, again:0 })

  useEffect(() => {
    setSrs(loadSRS())
    const url = bookId ? `${API_URL}/library/${bookId}/cards` : `${API_URL}/library/all-cards`
    fetch(url).then(r=>r.json()).then((data: Card[]) => {
      setAllCards(Array.isArray(data) ? data : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [bookId])

  useEffect(() => {
    if (!allCards.length) return
    const today = new Date().toISOString().split('T')[0]
    const srsData = loadSRS()
    // Cards due today or new
    const due = allCards.filter(c => {
      const p = srsData[c.id]
      if (!p) return true // new card
      return p.due <= today
    })
    // Limit session to 20 cards
    setSessionCards(due.slice(0, 20))
  }, [allCards])

  const handleAnswer = useCallback((quality: 0|1|2|3) => {
    const card = sessionCards[current]
    if (!card) return
    const existing = srs[card.id] || { id: card.id, due: new Date().toISOString().split('T')[0], interval: 1, ease: 2.5, reps: 0, last_result: 'new' }
    const updated = srsUpdate(existing, quality)
    const newSrs = { ...srs, [card.id]: updated }
    setSrs(newSrs); saveSRS(newSrs)
    const q = quality >= 2 ? 'good' : quality === 1 ? 'hard' : 'again'
    setStats(s => ({ ...s, [q]: s[q as 'good'|'hard'|'again']+1 }))
    if (current + 1 >= sessionCards.length) setSessionDone(true)
    else { setCurrent(c => c+1); setRevealed(false) }
  }, [current, sessionCards, srs])

  const restartSession = () => {
    const today = new Date().toISOString().split('T')[0]
    const srsData = loadSRS()
    const due = allCards.filter(c => { const p = srsData[c.id]; return !p || p.due <= today }).slice(0,20)
    setSessionCards(due); setCurrent(0); setRevealed(false); setSessionDone(false); setStats({good:0,hard:0,again:0})
  }

  const totalDue = allCards.filter(c => { const p = srs[c.id]; return !p || p.due <= new Date().toISOString().split('T')[0] }).length
  const totalLearned = Object.keys(srs).length
  const progress = allCards.length > 0 ? Math.round(totalLearned / allCards.length * 100) : 0

  if (loading) return <div className="flex items-center justify-center h-96"><span className="text-4xl animate-spin">⏳</span></div>

  if (sessionCards.length === 0 && !loading) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <span className="text-6xl">🎉</span>
      <h2 className="text-2xl font-bold text-slate-900 mt-4">Aucune carte à réviser aujourd’hui !</h2>
      <p className="text-slate-500 mt-2">Toutes vos cartes sont à jour. Revenez demain.</p>
      <div className="mt-8 bg-green-50 border border-green-200 rounded-2xl p-6">
        <p className="font-bold text-green-800">Progression totale</p>
        <div className="mt-3 bg-green-200 rounded-full h-4"><div className="bg-green-500 h-4 rounded-full transition-all" style={{width:`${progress}%`}} /></div>
        <p className="text-sm text-green-700 mt-1">{totalLearned} / {allCards.length} cartes apprises ({progress}%)</p>
      </div>
      <Link href="/library" className="mt-6 inline-block bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700">📚 Choisir un autre cours</Link>
    </div>
  )

  if (sessionDone) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <span className="text-6xl">✅</span>
      <h2 className="text-2xl font-bold text-slate-900 mt-4">Session terminée !</h2>
      <div className="grid grid-cols-3 gap-4 mt-8">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4"><div className="text-2xl font-bold text-green-600">{stats.good}</div><div className="text-sm text-green-700">Bien ✅</div></div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4"><div className="text-2xl font-bold text-amber-600">{stats.hard}</div><div className="text-sm text-amber-700">Difficile 🤔</div></div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4"><div className="text-2xl font-bold text-red-600">{stats.again}</div><div className="text-sm text-red-700">À revoir 🔁</div></div>
      </div>
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <div className="flex justify-between text-sm text-slate-600 mb-2"><span>Progression globale</span><span>{progress}%</span></div>
        <div className="bg-slate-200 rounded-full h-3"><div className="bg-blue-500 h-3 rounded-full transition-all" style={{width:`${progress}%`}} /></div>
        <p className="text-xs text-slate-400 mt-2">{totalLearned} / {allCards.length} cartes apprises</p>
      </div>
      <div className="flex gap-3 mt-6 justify-center">
        {totalDue > 0 && <button onClick={restartSession} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700">🔁 Continuer ({totalDue} restantes)</button>}
        <Link href="/library" className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-200">📚 Bibliothèque</Link>
        <Link href="/progress" className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-semibold hover:bg-slate-200">📊 Ma progression</Link>
      </div>
    </div>
  )

  const card = sessionCards[current]
  const progressPct = Math.round((current / sessionCards.length) * 100)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">{current+1} / {sessionCards.length}</span>
        <span className="text-sm text-slate-400">🔄 {totalDue} cartes dues</span>
      </div>

      {/* Progress bar */}
      <div className="bg-slate-200 rounded-full h-2 mb-8">
        <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{width:`${progressPct}%`}} />
      </div>

      {/* Card */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-lg p-8 min-h-64 flex flex-col">
        <span className={`self-start text-xs font-bold px-3 py-1 rounded-full mb-6 ${
          card.type==='qa' ? 'bg-blue-100 text-blue-700' :
          card.type==='cloze' ? 'bg-teal-100 text-teal-700' :
          'bg-purple-100 text-purple-700'}`}>{card.type==='qa'?'Question':card.type==='cloze'?'Texte à trous':'Liste'}</span>
        <p className="text-lg font-medium text-slate-800 flex-1 leading-relaxed">{card.question}</p>
        {revealed && (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-sm text-slate-400 mb-2">Réponse</p>
            <p className="text-slate-700 whitespace-pre-line leading-relaxed">{card.answer}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {!revealed ? (
        <button onClick={()=>setRevealed(true)}
          className="w-full mt-6 bg-blue-600 text-white py-4 rounded-2xl font-semibold text-lg hover:bg-blue-700 transition">
          Voir la réponse ↓
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-3 mt-6">
          <button onClick={()=>handleAnswer(0)} className="bg-red-50 border-2 border-red-200 text-red-700 py-4 rounded-2xl font-semibold hover:bg-red-100 transition flex flex-col items-center gap-1">
            <span className="text-xl">🔁</span><span className="text-sm">À revoir</span><span className="text-xs opacity-60">Demain</span>
          </button>
          <button onClick={()=>handleAnswer(1)} className="bg-amber-50 border-2 border-amber-200 text-amber-700 py-4 rounded-2xl font-semibold hover:bg-amber-100 transition flex flex-col items-center gap-1">
            <span className="text-xl">🤔</span><span className="text-sm">Difficile</span><span className="text-xs opacity-60">+2j</span>
          </button>
          <button onClick={()=>handleAnswer(3)} className="bg-green-50 border-2 border-green-200 text-green-700 py-4 rounded-2xl font-semibold hover:bg-green-100 transition flex flex-col items-center gap-1">
            <span className="text-xl">✅</span><span className="text-sm">Bien</span><span className="text-xs opacity-60">+{(srs[card.id]?.interval||1)*Math.round(srs[card.id]?.ease||2.5)}j</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function RevisionPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <header className="border-b border-blue-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2"><span className="text-xl">🧠</span><span className="font-bold text-lg text-blue-900">ECN Anki</span></Link>
          <nav className="flex gap-3">
            <Link href="/library" className="text-sm text-slate-500 hover:text-blue-700">📚 Bibliothèque</Link>
            <Link href="/revision" className="text-sm font-semibold text-blue-700">🃏 Réviser</Link>
            <Link href="/progress" className="text-sm text-slate-500 hover:text-blue-700">📊 Progression</Link>
          </nav>
        </div>
      </header>
      <Suspense fallback={<div className="flex justify-center py-20"><span className="text-4xl animate-spin">⏳</span></div>}>
        <RevisionContent />
      </Suspense>
    </main>
  )
}
