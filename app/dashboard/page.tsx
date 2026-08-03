'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'

interface AnkiCard { type: 'qa'|'cloze'|'list'|'definition'; question: string; answer: string }
interface Phase { name: string; period: string; new_cards_per_day: number; review_cards_per_day: number; tip: string }
interface WeekDay { day: string; cards: number }
interface StudyPlan {
  total_cards: number; target_date: string; days_available: number;
  cards_per_day: number; days_needed: number; estimated_completion: string;
  on_track: boolean; weekly_schedule: WeekDay[]; phases: Phase[];
  anki_settings: { new_cards_per_day: number; reviews_per_day: number; tip: string }
}
interface ParseResult { filename: string; elements_count: number; cards_count: number; cards: AnkiCard[]; study_plan: StudyPlan }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const typeColor: Record<string,string> = { qa:'bg-blue-100 text-blue-700', cloze:'bg-teal-100 text-teal-700', list:'bg-purple-100 text-purple-700', definition:'bg-amber-100 text-amber-700' }
const typeLabel: Record<string,string> = { qa:'Q/R', cloze:'Texte à trous', list:'Liste', definition:'Définition' }

export default function DashboardPage() {
  const [file, setFile] = useState<File|null>(null)
  const [result, setResult] = useState<ParseResult|null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [activeTab, setActiveTab] = useState<'all'|'qa'|'cloze'|'list'>('all')
  const [activeSection, setActiveSection] = useState<'cards'|'plan'>('cards')
  const [targetDate, setTargetDate] = useState('')
  const [cardsPerDay, setCardsPerDay] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.type==='application/pdf') { setFile(f); setError(null); setResult(null) }
    else if (f) setError('Veuillez sélectionner un fichier PDF')
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && f.type==='application/pdf') { setFile(f); setError(null); setResult(null) }
  }
  const handleSubmit = async () => {
    if (!file) return
    setLoading(true); setError(null)
    const formData = new FormData()
    formData.append('file', file)
    const params = new URLSearchParams()
    if (targetDate) params.append('target_date', targetDate)
    if (cardsPerDay) params.append('cards_per_day', cardsPerDay)
    try {
      const res = await fetch(`${API_URL}/parse-pdf?${params}`, { method:'POST', body:formData })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail||'Erreur serveur') }
      const data = await res.json()
      setResult(data)
      setActiveSection('cards')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue. Vérifiez que le backend est démarré.')
    } finally { setLoading(false) }
  }
  const downloadAnki = () => {
    if (!result) return
    const content = '#separator:tab\n#html:false\n#tags column:3\n' +
      result.cards.map(c=>`${c.question}\t${c.answer}\ttags:${c.type}`).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}))
    a.download = `anki_${result.filename.replace('.pdf','')}.txt`
    a.click()
  }
  const filteredCards = result?.cards.filter(c=>activeTab==='all'||c.type===activeTab)??[]

  const phaseColors = ['bg-blue-50 border-blue-200','bg-teal-50 border-teal-200','bg-purple-50 border-purple-200']

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <header className="border-b border-blue-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <span className="font-bold text-lg text-blue-900">ECN Anki Generator</span>
          </Link>
          <span className="text-sm text-slate-400">Dashboard</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Générer mes cartes Anki</h1>
        <p className="text-slate-500 mb-8">Uploadez votre fiche PDF et définissez votre programme de révision personnalisé.</p>

        {/* Upload zone */}
        <div
          onDrop={handleDrop} onDragOver={e=>e.preventDefault()} onClick={()=>fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-4 ${
            file ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-300 hover:bg-blue-50/50'
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <span className="text-5xl">📄</span>
              <p className="font-semibold text-blue-700">{file.name}</p>
              <p className="text-sm text-blue-400">{(file.size/1024/1024).toFixed(2)} MB</p>
              <button onClick={e=>{e.stopPropagation();setFile(null);setResult(null)}} className="text-xs text-red-400 hover:text-red-600">✕ Supprimer</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-5xl opacity-30">📤</span>
              <p className="text-slate-500 font-medium">Glissez votre PDF ici ou <span className="text-blue-600">cliquez pour parcourir</span></p>
              <p className="text-sm text-slate-400">Supports .pdf · Max <strong>200MB</strong></p>
            </div>
          )}
        </div>

        {/* Study Plan Options */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
          <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2">📅 Programme de révision</h2>
          <p className="text-sm text-slate-400 mb-4">Optionnel — laissez vide pour un plan automatique sur 90 jours</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">🎯 Date cible (ex: juin 2027)</label>
              <input
                type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <p className="text-xs text-slate-400 mt-1">"Je veux être prêt pour les EDN de juin 2027"</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">⚡ Cartes par jour (optionnel)</label>
              <input
                type="number" value={cardsPerDay} onChange={e=>setCardsPerDay(e.target.value)}
                placeholder="Ex: 20" min="1" max="200"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <p className="text-xs text-slate-400 mt-1">Laissez vide = calculé automatiquement</p>
            </div>
          </div>
          <div className="mt-3 bg-blue-50 rounded-xl px-4 py-3 flex items-start gap-2">
            <span className="text-blue-400">💡</span>
            <p className="text-xs text-blue-700">Le programme calculera 3 phases (Acquisition → Consolidation → Révision intensive) avec la répartition optimale nouvelles cartes / révisions pour Anki.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-4">
            <span>⚠️</span><p className="text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit} disabled={!file||loading}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {loading ? '⏳ Analyse en cours...' : '🧠 Générer les cartes + Programme'}
        </button>

        {result && (
          <div className="mt-10">
            {/* Tabs cartes / programme */}
            <div className="flex gap-2 mb-6 border-b border-slate-200 pb-3">
              <button onClick={()=>setActiveSection('cards')}
                className={`px-5 py-2 rounded-lg font-semibold text-sm transition ${
                  activeSection==='cards' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}>
                🃏 Cartes ({result.cards_count})
              </button>
              <button onClick={()=>setActiveSection('plan')}
                className={`px-5 py-2 rounded-lg font-semibold text-sm transition flex items-center gap-1.5 ${
                  activeSection==='plan' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}>
                📅 Programme
                {result.study_plan && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    result.study_plan.on_track ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {result.study_plan.on_track ? '✓ OK' : '⚠ Serré'}
                  </span>
                )}
              </button>
            </div>

            {activeSection === 'cards' && (
              <div>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-green-500 text-xl">✅</span>
                    <div>
                      <p className="font-bold text-slate-900">{result.cards_count} cartes générées</p>
                      <p className="text-sm text-slate-400">{result.elements_count} éléments extraits du PDF</p>
                    </div>
                  </div>
                  <button onClick={downloadAnki} className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl hover:bg-green-700 transition font-medium">
                    📥 Télécharger .txt Anki
                  </button>
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  {(['all','qa','cloze','list'] as const).map(tab=>(
                    <button key={tab} onClick={()=>setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                        activeTab===tab?'bg-blue-600 text-white':'text-slate-500 hover:bg-slate-100'
                      }`}>
                      {tab==='all'?'Toutes':typeLabel[tab]}
                      {tab!=='all'&&<span className="ml-1 text-xs opacity-70">({result.cards.filter(c=>c.type===tab).length})</span>}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {filteredCards.length===0 ? (
                    <p className="text-center text-slate-400 py-8">Aucune carte de ce type générée.</p>
                  ) : filteredCards.map((card,i)=>(
                    <div key={i} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${typeColor[card.type]||'bg-slate-100 text-slate-600'}`}>
                        {typeLabel[card.type]||card.type}
                      </span>
                      <p className="text-sm font-medium text-slate-800 mt-3 mb-2">❓ {card.question}</p>
                      <p className="text-sm text-slate-500 border-t pt-2 whitespace-pre-line">✅ {card.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'plan' && result.study_plan && (() => {
              const plan = result.study_plan
              return (
                <div className="space-y-6">
                  {/* Overview */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      {label:'Cartes totales', value: plan.total_cards, icon:'🃏'},
                      {label:'Cartes / jour', value: plan.cards_per_day, icon:'⚡'},
                      {label:'Jours disponibles', value: plan.days_available, icon:'📅'},
                      {label:'Fin estimée', value: plan.estimated_completion, icon: plan.on_track ? '✅' : '⚠️'},
                    ].map(stat=>(
                      <div key={stat.label} className="bg-white border border-slate-100 rounded-2xl p-4 text-center shadow-sm">
                        <div className="text-2xl mb-1">{stat.icon}</div>
                        <div className="font-bold text-lg text-slate-900">{stat.value}</div>
                        <div className="text-xs text-slate-400">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {!plan.on_track && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex gap-3">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <p className="font-semibold text-amber-800">Planning serré !</p>
                        <p className="text-sm text-amber-600">À {plan.cards_per_day} cartes/jour, vous terminerez le {plan.estimated_completion} — après votre date cible. Augmentez la cadence ou réduisez le deck.</p>
                      </div>
                    </div>
                  )}

                  {/* 3 Phases */}
                  <div>
                    <h3 className="font-bold text-slate-900 mb-3">📊 Phases de révision</h3>
                    <div className="space-y-3">
                      {plan.phases.map((phase, i)=>(
                        <div key={i} className={`border rounded-2xl p-5 ${phaseColors[i % 3]}`}>
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                            <span className="font-bold text-slate-800">{phase.name}</span>
                            <span className="text-xs text-slate-500 font-mono">{phase.period}</span>
                          </div>
                          <div className="flex gap-4 text-sm mb-2">
                            <span className="text-blue-700">🆕 {phase.new_cards_per_day} nouvelles/j</span>
                            <span className="text-teal-700">🔁 {phase.review_cards_per_day} révisions/j</span>
                          </div>
                          <p className="text-xs text-slate-500 italic">{phase.tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Weekly schedule */}
                  <div>
                    <h3 className="font-bold text-slate-900 mb-3">🗓 Planning hebdomadaire</h3>
                    <div className="grid grid-cols-7 gap-2">
                      {plan.weekly_schedule.map(d=>(
                        <div key={d.day} className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
                          <div className="text-xs text-slate-400 mb-1">{d.day.slice(0,3)}</div>
                          <div className="font-bold text-blue-600">{d.cards}</div>
                          <div className="text-xs text-slate-400">cartes</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-center">Charge réduite le week-end pour équilibrer vie personnelle et révisions.</p>
                  </div>

                  {/* Anki settings */}
                  <div className="bg-slate-800 text-white rounded-2xl p-5">
                    <h3 className="font-bold mb-3 flex items-center gap-2">⚙️ Paramètres Anki recommandés</h3>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="bg-white/10 rounded-xl p-3">
                        <div className="text-xs text-slate-300 mb-1">Nouvelles cartes / jour</div>
                        <div className="text-2xl font-bold">{plan.anki_settings.new_cards_per_day}</div>
                      </div>
                      <div className="bg-white/10 rounded-xl p-3">
                        <div className="text-xs text-slate-300 mb-1">Révisions / jour</div>
                        <div className="text-2xl font-bold">{plan.anki_settings.reviews_per_day}</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 bg-white/5 rounded-xl px-4 py-3 font-mono">{plan.anki_settings.tip}</p>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </main>
  )
}
