'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Book {
  id: string; title: string; category: string;
  filename: string; cards_count: number; created_at: string;
}

const CATEGORY_COLORS: Record<string,string> = {
  'Cardiologie':'bg-red-100 text-red-700',
  'Neurologie':'bg-purple-100 text-purple-700',
  'Pneumologie':'bg-blue-100 text-blue-700',
  'Général':'bg-slate-100 text-slate-600',
  'Réanimation':'bg-orange-100 text-orange-700',
  'Infectiologie':'bg-green-100 text-green-700',
  'Pédiatrie':'bg-pink-100 text-pink-700',
  'Chirurgie':'bg-amber-100 text-amber-700',
}

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('Tous')

  useEffect(() => {
    fetch(`${API_URL}/library`)
      .then(r => r.json())
      .then(data => { setBooks(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const categories = ['Tous', ...Array.from(new Set(books.map(b => b.category)))]
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

      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">📚 Bibliothèque ECN</h1>
        <p className="text-slate-500 mb-8">Tous les cours disponibles. Cliquez sur un livre pour commencer la révision.</p>

        <div className="flex gap-2 flex-wrap mb-8">
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${
                filter === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-6xl">📚</span>
            <p className="text-slate-500 mt-4 text-lg">Aucun cours disponible pour l’instant.</p>
            <p className="text-slate-400 text-sm mt-1">Les cours sont ajoutés par l’administrateur.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(book => {
              const colorClass = CATEGORY_COLORS[book.category] || 'bg-slate-100 text-slate-600'
              return (
                <Link key={book.id} href={`/revision?book=${book.id}`}
                  className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-3xl">📖</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${colorClass}`}>{book.category}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 mb-1 group-hover:text-blue-700 transition line-clamp-2">{book.title}</h3>
                  <p className="text-sm text-slate-400">{book.cards_count} cartes</p>
                  <div className="mt-4 flex items-center gap-2 text-blue-600 text-sm font-semibold group-hover:gap-3 transition-all">
                    <span>🃏 Réviser</span><span>→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
