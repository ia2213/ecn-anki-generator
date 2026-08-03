'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Book { id: string; title: string; category: string; filename: string; cards_count: number; created_at: string }

const CATEGORIES = ['Cardiologie','Neurologie','Pneumologie','Réanimation','Infectiologie','Pédiatrie','Chirurgie','Général']

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [books, setBooks] = useState<Book[]>([])
  const [file, setFile] = useState<File|null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Général')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{type:'ok'|'err',msg:string}|null>(null)

  const loadBooks = (key: string) => {
    fetch(`${API_URL}/library`).then(r=>r.json()).then(d=>setBooks(Array.isArray(d)?d:[]))
  }

  const handleLogin = () => {
    setAuthed(true)
    localStorage.setItem('admin_secret', secret)
    loadBooks(secret)
  }

  useEffect(() => {
    const saved = localStorage.getItem('admin_secret')
    if (saved) { setSecret(saved); setAuthed(true); loadBooks(saved) }
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true); setUploadMsg(null)
    const formData = new FormData()
    formData.append('file', file)
    const params = new URLSearchParams({ category, ...(title ? {title} : {}) })
    try {
      const res = await fetch(`${API_URL}/admin/books?${params}`, {
        method:'POST', body:formData,
        headers:{ authorization: `Bearer ${secret}` }
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      const data: Book = await res.json()
      setUploadMsg({type:'ok', msg:`✅ "${data.title}" ajouté — ${data.cards_count} cartes générées !`})
      setFile(null); setTitle('')
      loadBooks(secret)
    } catch(e:unknown) {
      setUploadMsg({type:'err', msg: e instanceof Error ? e.message : 'Erreur'})
    } finally { setUploading(false) }
  }

  const handleDelete = async (bookId: string, bookTitle: string) => {
    if (!confirm(`Supprimer "${bookTitle}" et toutes ses cartes ?`)) return
    await fetch(`${API_URL}/admin/books/${bookId}`, {
      method:'DELETE',
      headers:{ authorization: `Bearer ${secret}` }
    })
    loadBooks(secret)
  }

  if (!authed) return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-white rounded-3xl p-10 w-full max-w-md shadow-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">🔐 Administration</h1>
        <p className="text-slate-400 text-sm mb-6">Accès réservé à l’administrateur</p>
        <input type="password" value={secret} onChange={e=>setSecret(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&handleLogin()}
          placeholder="Clé d’administration" className="w-full border border-slate-200 rounded-xl px-4 py-3 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700">🔓 Accéder</button>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-950">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <span className="font-bold text-white">🔐 Admin ECN Anki</span>
          <Link href="/library" className="text-sm text-blue-300 hover:text-white">← Voir le site</Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-white mb-8">📚 Gestion des livres</h1>

        {/* Upload form */}
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 mb-8">
          <h2 className="font-bold text-white mb-4">➕ Ajouter un cours</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-blue-200 mb-1">Titre du cours</label>
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex: Cardiologie — ECN 2026"
                className="w-full bg-white/20 text-white border border-white/30 rounded-xl px-4 py-2.5 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm text-blue-200 mb-1">Catégorie</label>
              <select value={category} onChange={e=>setCategory(e.target.value)}
                className="w-full bg-white/20 text-white border border-white/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {CATEGORIES.map(c=><option key={c} value={c} className="text-slate-900">{c}</option>)}
              </select>
            </div>
          </div>
          <div className="border-2 border-dashed border-white/30 rounded-xl p-6 text-center mb-4 cursor-pointer hover:border-blue-400 transition" onClick={()=>document.getElementById('admin-file')?.click()}>
            <input id="admin-file" type="file" accept=".pdf" className="hidden" onChange={e=>setFile(e.target.files?.[0]||null)} />
            {file ? <p className="text-white font-semibold">📄 {file.name} ({(file.size/1024/1024).toFixed(1)}MB)</p>
              : <p className="text-white/50">Glissez un PDF ou <span className="text-blue-300">cliquez</span></p>}
          </div>
          {uploadMsg && <div className={`rounded-xl px-4 py-3 mb-4 text-sm font-medium ${uploadMsg.type==='ok'?'bg-green-500/20 text-green-200 border border-green-500/30':'bg-red-500/20 text-red-200 border border-red-500/30'}`}>{uploadMsg.msg}</div>}
          <button onClick={handleUpload} disabled={!file||uploading}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
            {uploading ? '⏳ Traitement...' : '🚀 Ajouter le cours'}
          </button>
        </div>

        {/* Books list */}
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6">
          <h2 className="font-bold text-white mb-4">📚 Cours publiés ({books.length})</h2>
          {books.length === 0 ? <p className="text-white/40 text-sm">Aucun cours encore ajouté.</p> : (
            <div className="space-y-3">
              {books.map(book => (
                <div key={book.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-5 py-4">
                  <div>
                    <p className="font-semibold text-white">{book.title}</p>
                    <p className="text-sm text-blue-300">{book.category} · {book.cards_count} cartes · {book.created_at}</p>
                  </div>
                  <button onClick={()=>handleDelete(book.id, book.title)} className="text-red-400 hover:text-red-300 text-sm font-medium px-3 py-1 rounded-lg hover:bg-red-500/10 transition">
                    ✕ Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
