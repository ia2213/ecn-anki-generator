import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
      <header className="border-b border-blue-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <span className="font-bold text-xl text-blue-900">ECN Anki Generator</span>
          </div>
          <Link href="/dashboard" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition font-medium">
            Commencer →
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
          ⚡ PDF → Cartes Anki en quelques secondes
        </div>
        <h1 className="text-5xl font-extrabold text-slate-900 mb-6 leading-tight">
          Révisez les ECN/EDN<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500">plus intelligemment</span>
        </h1>
        <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
          Uploadez vos fiches PDF. Notre moteur génère automatiquement des cartes Anki
          optimisées (Q/R, textes à trous, listes) pour vos révisions ECN.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/dashboard" className="bg-blue-600 text-white px-8 py-3.5 rounded-xl hover:bg-blue-700 transition font-semibold text-lg shadow-lg shadow-blue-200">
            Générer mes cartes
          </Link>
          <a href="#how-it-works" className="border border-slate-200 text-slate-700 px-8 py-3.5 rounded-xl hover:border-blue-300 transition font-semibold text-lg">
            Comment ça marche
          </a>
        </div>
      </section>

      <section className="bg-white border-y border-slate-100 py-10">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 gap-8 text-center">
          {[{value:'3 types',label:'de cartes générées'},{value:'< 30s',label:'par document PDF'},{value:'100%',label:'compatible Anki'}].map(s=>(
            <div key={s.label}>
              <div className="text-3xl font-bold text-blue-600">{s.value}</div>
              <div className="text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">Comment ça marche</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {icon:'📄',step:'1',title:'Importez votre PDF',desc:"Uploadez directement ou connectez votre Google Drive pour accéder à vos fiches de cours."},
            {icon:'🧠',step:'2',title:'Analyse automatique',desc:'Notre moteur extrait titres, listes et définitions pour structurer le contenu médical.'},
            {icon:'📥',step:'3',title:'Téléchargez vos cartes',desc:'Récupérez un fichier .txt prêt à importer dans Anki (Q/R, textes à trous, listes).'},
          ].map(item=>(
            <div key={item.step} className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm card-hover">
              <div className="text-4xl mb-4">{item.icon}</div>
              <div className="text-sm font-semibold text-blue-500 mb-2">Étape {item.step}</div>
              <h3 className="font-bold text-lg text-slate-900 mb-2">{item.title}</h3>
              <p className="text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-4">3 types de cartes générés</h2>
          <p className="text-center text-slate-500 mb-12">Adaptés aux exigences des ECN/EDN</p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {type:'Q/R Classique',color:'blue',q:'Quels sont les signes cliniques de la méningite bactérienne ?',a:'Fièvre, céphalées en casque, raideur méningée, photophobie, purpura'},
              {type:'Texte à trous',color:'teal',q:'La [__?__] est le principal traitement de la méningite à méningocoque',a:'céfotaxime'},
              {type:'Liste',color:'purple',q:'Quels sont les éléments du score de Glasgow ?',a:'• Ouverture des yeux\n• Réponse verbale\n• Réponse motrice'},
            ].map(card=>(
              <div key={card.type} className="bg-white rounded-2xl p-6 border border-slate-200">
                <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full mb-4 ${card.color==='blue'?'bg-blue-100 text-blue-700':card.color==='teal'?'bg-teal-100 text-teal-700':'bg-purple-100 text-purple-700'}`}>{card.type}</span>
                <div className="text-sm text-slate-700 mb-3 font-medium">❓ {card.q}</div>
                <div className="text-sm text-slate-500 border-t pt-3 whitespace-pre-line">✅ {card.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Prêt à réviser plus efficacement ?</h2>
        <p className="text-slate-500 mb-8">Rejoignez les étudiants en médecine qui optimisent leurs révisions ECN avec Anki.</p>
        <Link href="/dashboard" className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 transition font-semibold text-lg shadow-lg shadow-blue-200">
          Commencer gratuitement →
        </Link>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-400">
        ECN Anki Generator — Pour les étudiants en médecine 🩺
      </footer>
    </main>
  )
}
