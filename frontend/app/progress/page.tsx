'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const SRS_KEY = 'ecn_srs_v1'

interface CardProgress { id: string; due: string; interval: number; ease: number; reps: number; last_result: string }
interface Book { id: string; title: string; category: string; cards_count: number }

export default function ProgressPage() {
  const [srs, setSrs] = useState<Record<string,CardProgress>>({})
  const [books, setBooks] = useState<Book[]>([])
  const [streak, setStreak] = useState(0)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [notifTime, setNotifTime] = useState('08:00')
  const [notifSaved, setNotifSaved] = useState(false)

  useEffect(() => {
    try { setSrs(JSON.parse(localStorage.getItem(SRS_KEY)||'{}')) } catch {}
    const savedTime = localStorage.getItem('notif_time'); if (savedTime) setNotifTime(savedTime)
    if (typeof Notification !== 'undefined') setNotifEnabled(Notification.permission === 'granted')
    // streak
    const hist: string[] = JSON.parse(localStorage.getItem('study_history')||'[]')
    let s = 0
    const today = new Date()
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(today.getDate()-i)
      const key = d.toISOString().split('T')[0]
      if (hist.includes(key)) s++; else break
    }
    setStreak(s)
    fetch(`${API_URL}/library`).then(r=>r.json()).then(d=>setBooks(Array.isArray(d)?d:[])).catch(()=>{})
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const totalCards = Object.keys(srs).length
  const dueToday = Object.values(srs).filter(c => c.due <= today).length
  const mastered = Object.values(srs).filter(c => c.reps >= 5 && c.ease > 2.0).length
  const totalAll = books.reduce((s,b) => s+b.cards_count, 0)

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return alert('Notifications non supportées par ce navigateur')
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setNotifEnabled(true)
      scheduleNotification(notifTime)
      new Notification('🧠 ECN Anki', { body: 'Notifications activées ! On te rappellera chaque jour.', icon: '/favicon.ico' })
    }
  }

  const scheduleNotification = (time: string) => {
    localStorage.setItem('notif_time', time)
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 3000)
    // Register service worker notification via setTimeout for demo
    const [h,m] = time.split(':').map(Number)
    const now = new Date()
    const next = new Date(); next.setHours(h,m,0,0)
    if (next <= now) next.setDate(next.getDate()+1)
    const ms = next.getTime() - now.getTime()
    setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification('🧠 ECN Anki — Heure de réviser !', { body: `${dueToday} cartes vous attendent aujourd'hui.`, icon: '/favicon.ico' })
      }
    }, ms)
  }

  // Per-book progress
  const bookProgress = books.map(book => {
    const bookCards = Object.values(srs).filter(c => c.id.startsWith(book.id))
    const pct = book.cards_count > 0 ? Math.round(bookCards.length / book.cards_count * 100) : 0
    return { ...book, learned: bookCards.length, pct }
  })

  // Last 7 days activity
  const hist: string[] = JSON.parse(typeof window !== 'undefined' ? localStorage.getItem('study_history')||'[]' : '[]')
  const last7 = Array.from({length:7},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-6+i)
    const key = d.toISOString().split('T')[0]
    return { key, label: d.toLocaleDateString('fr',{weekday:'short'}), active: hist.includes(key) }
  })

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <header className="border-b border-blue-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2"><span className="text-xl">🧠</span><span className="font-bold text-lg text-blue-900">ECN Anki</span></Link>
          <nav className="flex gap-3">
            <Link href="/library" className="text-sm text-slate-500 hover:text-blue-700">📚 Bibliothèque</Link>
            <Link href="/revision" className="text-sm text-slate-500 hover:text-blue-700">🃏 Réviser</Link>
            <Link href="/progress" className="text-sm font-semibold text-blue-700">📊 Progression</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-8">📊 Ma Progression</h1>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {icon:'📚', label:'Cartes apprises', value:`${totalCards} / ${totalAll}`, sub:'total'},
            {icon:'🔄', label:'À réviser', value:dueToday, sub:'aujourd\'hui', accent:dueToday>0},
            {icon:'⭐', label:'Maîtrisées', value:mastered, sub:'≥5 répétitions'},
            {icon:'🔥', label:'Série', value:`${streak}j`, sub:'consécutifs'},
          ].map(kpi => (
            <div key={kpi.label} className={`bg-white border rounded-2xl p-5 text-center shadow-sm ${
              kpi.accent ? 'border-orange-200 bg-orange-50' : 'border-slate-100'}`}>
              <div className="text-3xl mb-1">{kpi.icon}</div>
              <div className="font-bold text-xl text-slate-900">{kpi.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Global progress bar */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-slate-800">🏆 Progression globale</h2>
            <span className="text-sm font-bold text-blue-600">{totalAll>0?Math.round(totalCards/totalAll*100):0}%</span>
          </div>
          <div className="bg-slate-200 rounded-full h-4">
            <div className="bg-gradient-to-r from-blue-500 to-teal-400 h-4 rounded-full transition-all duration-700"
              style={{width:`${totalAll>0?Math.round(totalCards/totalAll*100):0}%`}} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>{totalCards} cartes vues</span><span>{Math.max(0,totalAll-totalCards)} restantes</span>
          </div>
        </div>

        {/* Activity last 7 days */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-4">🗓 Activité des 7 derniers jours</h2>
          <div className="flex gap-2">
            {last7.map(d => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full h-10 rounded-xl ${ d.active ? 'bg-blue-500' : 'bg-slate-100'}`} />
                <span className="text-xs text-slate-400">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-book progress */}
        {bookProgress.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="font-bold text-slate-800 mb-4">📖 Par cours</h2>
            <div className="space-y-4">
              {bookProgress.map(book => (
                <div key={book.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{book.title}</span>
                    <span className="text-slate-400">{book.learned}/{book.cards_count}</span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{width:`${book.pct}%`}} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notifications */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-1">🔔 Rappels de révision</h2>
          <p className="text-sm text-slate-400 mb-5">Recevez une notification quotidienne pour ne jamais rater une session.</p>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Heure du rappel</label>
              <input type="time" value={notifTime} onChange={e=>setNotifTime(e.target.value)}
                className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            {notifEnabled ? (
              <div className="flex gap-3 items-center">
                <button onClick={()=>scheduleNotification(notifTime)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition">
                  Enregistrer l’heure
                </button>
                {notifSaved && <span className="text-green-600 text-sm font-semibold">✓ Enregistré !</span>}
              </div>
            ) : (
              <button onClick={enableNotifications} className="bg-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition flex items-center gap-2">
                🔔 Activer les notifications
              </button>
            )}
          </div>
          {notifEnabled && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
              ✅ Notifications activées — rappel quotidien à <strong>{notifTime}</strong>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <Link href="/revision" className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-semibold text-center hover:bg-blue-700">
            🃏 Commencer la révision ({dueToday} cartes)
          </Link>
        </div>
      </div>
    </main>
  )
}
