'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Book {
  id: string; title: string; category: string;
  filename: string; cards_count: number; created_at: string; uploaded_by?: string;
  analysis?: { pages?: number; estimated_quality_score?: number; summary?: { flashcard_potential?: string } }
}

const CATEGORY_COLORS: Record<string,string> = {
  'Cardiologie':'bg-red-100 text-red-700','Neurologie':'bg-purple-100 text-purple-700','Pneumologie':'bg-blue-100 text-blue-700','Général':'bg-slate-100 text-slate-600','Réanimation':'bg-orange-100 text-orange-700','Infectiologie':'bg-green-100 text-green-700','Pédiatrie':'bg-pink-100 text-pink-700','Chirurgie':'bg-amber-100 text-amber-700',
}

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Tous')
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Général')
  const [contributorName, setContributorName] = useState('')
  const [message, setMessage] = useState<{type:'ok'|'err', text:string} | null>(null)

  const loadBooks = () => {
    fetch(`${API_URL}/library`)
      .then(r => r.json())
      .then(data => { setBooks(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadBooks() }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true); setMessage(null)
    const formData = new FormData()
    formData.append('file', file)
    const params = new URLSearchParams({
      category,
      contributor_name: contributorName || 'anonymous',
      ...(title ? { title } : {}),
    })
    try {
      const res = await fetch(`${API_URL}/community/books?${params.toString()}`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erreur lors de l’ajout')
      if (data.duplicate) {
        setMessage({ type: 'err', text: `Ce document a déjà été ajouté : ${data.book.title}` })
      } else {
        setMessage({ type: 'ok', text: `Cours ajouté : ${data.book.title} · ${data.cards_count} cartes générées · score qualité ${data.analysis.estimated_quality_score}/100` })
        setFile(null); setTitle('')
        loadBooks()
      }
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message || 'Erreur' })
    } finally { setUploading(false) }
  }

  const categories = ['Tous', ...Array.from(new Set(['Général', ...books.map(b => b.category)]))]
  const filtered = filter === 'Tous' ? books : books.filter(b => b.category === filter)

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <header className="border-b border-blue-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2"><span className="text-xl">🧠</span><span className="font-bold text-lg text-blue-900">ECN Anki</span></Link>
          <nav className="flex gap-3">
            <Link href="/library" className="text-sm font-semibold text-blue-700">📚 Bibliothèque</Link>
            <Link href="/revision" className="text-sm text-slate-500 hover:text-blue-700">🃏 Réviser</Link>
            <Link href="/progress" className="text-sm text-slate-500 hover:text-blue-700">📊 Progression</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8 items-start">
          <section>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">📚 Bibliothèque collaborative ECN</h1>
            <p className="text-slate-500 mb-8">Tout le monde peut ajouter un cours. Chaque PDF est analysé, transformé en cartes, puis conservé comme source.</p>

            <div className="flex gap-2 flex-wrap mb-8">
              {categories.map(cat => (
                <button key={cat} onClick={() => setFilter(cat)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${filter === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-52 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 bg-white border border-slate-100 rounded-3xl">
                <span className="text-6xl">📚</span>
                <p className="text-slate-500 mt-4 text-lg">Aucun cours disponible pour l’instant.</p>
                <p className="text-slate-400 text-sm mt-1">Ajoutez le premier document depuis le formulaire.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map(book => {
                  const colorClass = CATEGORY_COLORS[book.category] || 'bg-slate-100 text-slate-600'
                  const quality = book.analysis?.estimated_quality_score || 0
                  return (
                    <Link key={book.id} href={`/revision?book=${book.id}`}
                      className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
                      <div className="flex items-start justify-between mb-4">
                        <span className="text-3xl">📖</span>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${colorClass}`}>{book.category}</span>
                      </div>
                      <h3 className="font-bold text-slate-900 mb-1 group-hover:text-blue-700 transition line-clamp-2">{book.title}</h3>
                      <p className="text-sm text-slate-400 mb-4">Ajouté par {book.uploaded_by || 'anonymous'} · {book.cards_count} cartes</p>
                      <div className="grid grid-cols-3 gap-2 text-center mb-4">
                        <div className="bg-slate-50 rounded-xl p-2"><div className="text-xs text-slate-400">Pages</div><div className="font-bold text-slate-700">{book.analysis?.pages || '—'}</div></div>
                        <div className="bg-slate-50 rounded-xl p-2"><div className="text-xs text-slate-400">Qualité</div><div className="font-bold text-slate-700">{quality}/100</div></div>
                        <div className="bg-slate-50 rounded-xl p-2"><div className="text-xs text-slate-400">Potentiel</div><div className="font-bold text-slate-700 text-xs">{book.analysis?.summary?.flashcard_potential || '—'}</div></div>
                      </div>
                      <div className="mt-4 flex items-center gap-2 text-blue-600 text-sm font-semibold group-hover:gap-3 transition-all"><span>🃏 Réviser</span><span>→</span></div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm sticky top-24">
            <h2 className="text-xl font-bold text-slate-900 mb-2">➕ Ajouter un cours</h2>
            <p className="text-sm text-slate-500 mb-5">Le PDF sera analysé automatiquement puis utilisé comme source des cartes Anki.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Votre nom</label>
                <input value={contributorName} onChange={e=>setContributorName(e.target.value)} placeholder="Ex: Sarah D4" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Titre du cours</label>
                <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex: Néphrologie ECN" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                <select value={category} onChange={e=>setCategory(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {['Général','Cardiologie','Neurologie','Pneumologie','Réanimation','Infectiologie','Pédiatrie','Chirurgie'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PDF</label>
                <input type="file" accept=".pdf" onChange={e=>setFile(e.target.files?.[0] || null)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white" />
              </div>
              {message && <div className={`rounded-xl px-4 py-3 text-sm ${message.type==='ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{message.text}</div>}
              <button onClick={handleUpload} disabled={!file || uploading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                {uploading ? '⏳ Analyse en cours...' : '🚀 Ajouter à la bibliothèque'}
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 text-sm text-slate-500 space-y-2">
              <p>✅ Détection des doublons.</p>
              <p>✅ Analyse complète du document.</p>
              <p>✅ Le fichier reste la source des cartes.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
