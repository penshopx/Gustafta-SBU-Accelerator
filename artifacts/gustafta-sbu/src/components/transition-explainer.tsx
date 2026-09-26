const tracks = [
  {
    number: '01',
    audience: 'Untuk LSBU',
    title: 'Penyesuaian skema sertifikasi',
    detail: 'Menyangkut penyesuaian skema LSBU terhadap ketentuan baru. Periode ini tidak otomatis menjadi tanggal awal konversi SBU yang sudah terbit.',
  },
  {
    number: '02',
    audience: 'Untuk SBU yang sudah terbit',
    title: 'Konversi SBU eksisting',
    detail: 'Menyangkut SBU lama dan memiliki pemicu waktu yang berbeda. Jangan menghitung tenggatnya dari tanggal penetapan Kepdirjen saja.',
  },
];

export function TransitionExplainer() {
  return (
    <section aria-labelledby="transition-title" className="mb-7 overflow-hidden rounded-2xl border border-[#bfd5e7] bg-[#e5f2fc]">
      <div className="border-b border-[#bfd5e7] px-6 py-6 sm:px-8">
        <div className="eyebrow text-[#1769d1]">PANDUAN MEMBACA MASA TRANSISI</div>
        <h2 id="transition-title" className="display mt-2 text-2xl font-extrabold text-[#142c46]">Dua alur, bukan satu tanggal.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#456780]">
          Penyesuaian skema LSBU dan konversi SBU yang sudah terbit tidak boleh disatukan menjadi satu hitungan waktu.
        </p>
      </div>
      <div className="grid gap-px bg-[#bfd5e7] md:grid-cols-2">
        {tracks.map((track) => (
          <div key={track.number} className="bg-[#f8fcff] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="mono grid h-9 w-9 place-items-center rounded-lg bg-[#1769d1] text-xs font-bold text-white">{track.number}</span>
              <span className="eyebrow text-[#1769d1]">{track.audience}</span>
            </div>
            <h3 className="display mt-5 text-lg font-extrabold text-[#142c46]">{track.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#526f86]">{track.detail}</p>
          </div>
        ))}
      </div>
      <div className="bg-[#d5eaf9] px-6 py-4 text-xs leading-6 text-[#355a76] sm:px-8">
        <strong>Belum ada hitung mundur di aplikasi.</strong> Tanggal pemberlakuan operasional dan awal hitungan konversi perlu diperiksa pada surat resmi yang relevan. Rujukan: Permen PU 6/2025 Pasal 20–21 dan surat pengantar Kepdirjen 281/KPTS/DK/2026.
      </div>
    </section>
  );
}