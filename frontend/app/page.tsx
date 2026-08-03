import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-teal-900 text-white">
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <span className="font-bold text-xl">ECN Anki</span>
          </div>
          <nav className="flex gap-4">
            <Link href="/library" className="text-sm text-blue-200 hover:text-white transition">📚 Bibliothèque</Link>
            <Link href="/revision" className="text-sm text-blue-200 hover:text-white transition">🃏 Réviser</Link>
            <Link href="/progress" className="text-sm text-blue-200 hover:text-white transition">📊 Progression</Link>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-sm px-4 py-2 rounded-full mb-8">
          <span>✨</span><span>Plateforme de révision ECN — Cartes + SRS</span>
        </div>
        <h1 className="text-5xl font-black mb-6 leading-tight">Révisez l’ECN avec les<br /><span className="text-teal-300">meilleures cartes Anki</span></h1>
        <p className="text-xl text-blue-200 mb-12 max-w-2xl mx-auto">Tous les cours de l’ECN en cartes intelligentes. Répétition espacée (SRS), suivi de progression, notifications quotidiennes.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/library" className="bg-teal-400 text-slate-900 font-bold px-8 py-4 rounded-2xl text-lg hover:bg-teal-300 transition shadow-lg">
            📚 Voir les cours →
          </Link>
          <Link href="/revision" className="bg-white/10 border border-white/20 text-white font-bold px-8 py-4 rounded-2xl text-lg hover:bg-white/20 transition">
            🃏 Commencer à réviser
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24">
          {[
            {icon:'📚', title:'Bibliothèque complète', desc:'Tous les cours de l’ECN ajoutés par l’admin, disponibles en un clic.'},
            {icon:'🧠', title:'Répétition espacée (SRS)', desc:'Algorithme SM-2 — chaque carte revient au bon moment pour maximiser la mémorisation.'},
            {icon:'🔔', title:'Rappels quotidiens', desc:'Notifications personnalisées à l’heure de votre choix pour ne jamais rater une session.'},
          ].map(f => (
            <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-blue-200 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
