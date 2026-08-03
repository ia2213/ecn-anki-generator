'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'

interface AnkiCard { type: 'qa'|'cloze'|'list'|'definition'; question: string; answer: string }
interface ParseResult { filename: string; elements_count: number; cards_count: number; cards: AnkiCard[] }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const typeColor: Record<string,string> = { qa:'bg-blue-100 text-blue-700', cloze:'bg-teal-100 text-teal-700', list:'bg-purple-100 text-purple-700', definition:'bg-amber-100 text-amber-700' }
const typeLabel: Record<string,string> = { qa:'Q/R', cloze:'Texte à trous', list:'Liste', definition:'Définition' }

export default function DashboardPage() {
  const [file, setFile] = useState<File|null>(null)
  const [result, setResult] = useState<ParseResult|null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [activeTab, setActiveTab] = useState<'all'|'qa'|'cloze'|'list'>('all')
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
    try {
      const res = await fetch(`${API_URL}/parse-pdf`, { method:'POST', body:formData })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail||'Erreur serveur') }
      setResult(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally { setLoading(false) }
  }
  const downloadAnki = () => {
    if (!result) return
    const content = '#separator:tab\n#html:false\n#tags column:3\n' + result.cards.map(c=>`${c.question}\t${c.answer}\ttags:${c.type}`).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}))
    a.download = `anki_${result.filename.replace('.pdf','')}.txt`
    a.click()
  }
  const filteredCards = result?.cards.filter(c=>activeTab==='all'||c.type===activeTab)??[]

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
        <p className="text-slate-500 mb-8">Uploadez votre fiche PDF de cours médical pour générer automatiquement des cartes de révision.</p>

        <div
          onDrop={handleDrop} onDragOver={e=>e.preventDefault()} onClick={()=>fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all mb-6 ${file?'border-blue-400 bg-blue-50':'border-slate-300 hover:border-blue-300 hover:bg-blue-50/50'}`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          {file ? (
            <div className="flex flex-col items-center gap-3">
              <span className="text-5xl">📄</span>
              <p className="font-semibold text-blue-700">{file.name}</p>
              <p className="text-sm text-blue-400">{(file.size/1024/1024).toFixed(2)} MB</p>
              <button onClick={e=>{e.stopPropagation();setFile(null);setResult(null)}} className="text-xs text-red-400 hover:text-red-600">✕ Supprimer</button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <span className="text-5xl opacity-30">📤</span>
              <p className="text-slate-500 font-medium">Glissez votre PDF ici ou <span className="text-blue-600">cliquez pour parcourir</span></p>
              <p className="text-sm text-slate-400">Supports .pdf · Max 50MB</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
          <span className="text-xl">🔗</span>
          <div>
            <p className="text-sm font-medium text-amber-800">Connexion Google Drive</p>
            <p className="text-xs text-amber-600">Bientôt disponible — configurez vos clés API Google Cloud pour activer cette fonctionnalité.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-6">
            <span>⚠️</span><p className="text-sm">{error}</p>
          </div>
        )}

        <button onClick={handleSubmit} disabled={!file||loading}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {loading ? '⏳ Analyse en cours...' : '🧠 Générer les cartes Anki'}
        </button>

        {result && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
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

            <div className="flex gap-2 mb-4 border-b border-slate-100 pb-2 flex-wrap">
              {(['all','qa','cloze','list'] as const).map(tab=>(
                <button key={tab} onClick={()=>setActiveTab(tab)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab===tab?'bg-blue-600 text-white':'text-slate-500 hover:bg-slate-100'}`}
                >
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
      </div>
    </main>
  )
}
