const tracks = [
  {
    number: '01',
    audience: 'Untuk LSBU',
    title: 'Penyesuaian skema sertifikasi',
    detail: 'Diktum KEEMPAT Kepdirjen 281/2026 menyebut penyesuaian dan implementasi skema paling lambat 6 bulan sejak penetapan keputusan. Pemberlakuan operasional sertifikasi tetap menunggu penyesuaian SIJK dan surat resmi. Cakupannya masih perlu tinjauan ahli.',
  },
  {
    number: '02',
    audience: 'Untuk SBU yang sudah terbit',
    title: 'Konversi SBU eksisting',
    detail: 'Permen PU 6/2025 Pasal 21 menghitung 6 bulan sejak terbitnya surat yang dimaksud Pasal 20 ayat (2), bukan sejak penetapan Kepdirjen. Surat pemicunya belum terverifikasi; pengecualian pada Pasal 21 ayat (7) perlu ditinjau.',
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
            <p className="mt-4 inline-block rounded-full bg-[#e5f2fc] px-3 py-1 text-xs font-bold text-[#1769d1]">Tenggat belum terverifikasi</p>
          </div>
        ))}
      </div>
      <div className="bg-[#d5eaf9] px-6 py-4 text-xs leading-6 text-[#355a76] sm:px-8">
        <strong>Belum ada tanggal atau hitung mundur di aplikasi.</strong> Agar dapat ditampilkan, diperlukan (1) salinan surat Pasal 20 ayat (2) dan konfirmasi resmi nomor, penandatangan, tanggal, cakupan, status mutakhir surat serta Kepdirjen 281/KPTS/DK/2026; dan (2) tinjauan ahli skema/LSBU atas pemicu LSBU, pemberlakuan operasional, konversi SBU, serta pengecualiannya. Keduanya belum tersedia untuk verifikasi; ini <strong>bukan berarti surat belum terbit</strong>. Rujukan: <a href="https://jdih.pu.go.id/detail-dokumen/PermenPU-nomor-6-tahun-2025-Standar-Kegiatan-Usaha-danatau-Standar-ProdukJasa-Pelaksanaan-Pengawasan-dan-Pengenaan-Sanksi-pada-Penyelenggaraan-Perizinan-Berusaha-Berbasis-Risiko-Sektor-Pekerjaan-Umum" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Permen PU 6/2025 Pasal 20–21</a> dan Kepdirjen 281/KPTS/DK/2026 diktum KEEMPAT (salinan unggahan).
      </div>
    </section>
  );
}