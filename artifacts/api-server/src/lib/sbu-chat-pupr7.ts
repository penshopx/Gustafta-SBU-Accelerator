import type { ChatSourceVersion } from "./sbu-chat-retrieval";

const versionId = "pupr7-20261104-r1";
const entries = [
  {
    id: "pupr7-pub", page: 3, locator: "Pasal 2–4 — PDF hlm. 3",
    excerpt: "Salinan mengatur pembinaan anggota asosiasi untuk mempertahankan atau meningkatkan kemampuan BUJK. Pasal 3 menyebut PUB bagi setiap BUJK dan penyelenggaraan oleh asosiasi terhadap anggotanya. Pasal 4 membedakan PUB umum bagi seluruh anggota dari PUB khusus bagi seluruh BUJK kecil serta berdasarkan pemetaan nilai kinerja untuk BUJK menengah, besar dan spesialis.",
    limitation: "PUB bukan semata-mata satu sertifikat pelatihan. Jangan menyamakan kewajiban PUB umum dengan pemilihan peserta PUB khusus atau menganggap catatan lokal membuktikan pemenuhan resmi.",
    terms: ["pengembangan usaha berkelanjutan", "pupr 7/2024", "permen pupr 7", "pub umum", "pub khusus", "pembinaan anggota"],
  },
  {
    id: "pupr7-pub-umum", page: 4, locator: "Pasal 6–7 — PDF hlm. 4–5",
    excerpt: "Pasal 6 pada salinan menyebut penyelenggaraan PUB umum oleh asosiasi paling sedikit sekali setahun. Pasal 7 menjelaskan workshop, sosialisasi atau kegiatan sejenis, dengan tahap persiapan, pelaksanaan, pelaporan dan evaluasi. Laporan memuat nama asosiasi, sifat/bentuk kegiatan, tempat/tanggal, peserta, materi, dokumentasi serta rekomendasi dan rencana tindak lanjut. Pasal 7 ayat (5) menyebut penyampaian melalui SIJK terintegrasi paling lama 14 hari kerja setelah kegiatan berakhir.",
    limitation: "Frekuensi dan batas pelaporan adalah isi salinan, bukan hitung mundur otomatis atau konfirmasi prosedur SIJK terkini. Tenggat laporan penyelenggara kegiatan tidak sama dengan tenggat LKUT BUJK; aplikasi tidak menyampaikan laporan asosiasi.",
    terms: ["pub umum", "workshop", "sosialisasi", "laporan kegiatan pub", "14 hari kerja", "pasal 7"],
  },
  {
    id: "pupr7-pub-khusus", page: 5, locator: "Pasal 8–9, 11–13 — PDF hlm. 5–7",
    excerpt: "Salinan membahas pembelajaran tekstual, pembelajaran interaktif jarak jauh, bimbingan teknis atau pendampingan intensif sesuai modul peningkatan kinerja. Pasal 9 menyebut PUB khusus bagi BUJK kecil paling sedikit sekali setahun. Pasal 11 mengaitkan prioritas dengan hasil pemetaan kinerja, termasuk grade B, C dan D. Pasal 12–13 membahas pelaporan dan evaluasi peningkatan kinerja sebelum/sesudah PUB khusus.",
    limitation: "Tidak menghitung grade atau menentukan peserta wajib PUB khusus dari bukti lokal. Ketentuan pemetaan BUJK menengah/besar/spesialis berbeda dari pembinaan BUJK kecil. Grade kinerja bukan kualifikasi SBU atau keputusan kelayakan perpanjangan.",
    terms: ["pub khusus", "pendampingan intensif", "bimbingan teknis", "modul peningkatan kinerja", "grade kinerja", "pasal 13"],
  },
  {
    id: "pupr7-lkut", page: 5, locator: "Pasal 10 ayat (1)–(4) — PDF hlm. 5",
    excerpt: "Pasal 10 ayat (1) pada salinan membahas pengisian kinerja BUJK menengah, besar dan spesialis dalam SIJK terintegrasi untuk pemetaan kinerja tahunan. Ayat (2) menyebut pengisian tersebut sebagai bagian LKUT. Ayat (3) menyebut penyampaian laporan kepada Menteri melalui Direktur Jenderal paling lambat 30 April tahun berikutnya melalui SIJK terintegrasi; ayat (4) merujuk rincian isian pada lampiran.",
    limitation: "Pembacaan tanggal harus mempertahankan konteks ayat (1)–(4), cakupan pelapor, tahun laporan dan ketentuan terkini. Tidak mengaktifkan tenggat otomatis, mengklaim laporan diterima SIJK, atau menyamakan pengisian kinerja dengan seluruh LKUT.",
    terms: ["lkut", "laporan kegiatan usaha tahunan", "30 april", "pasal 10", "tahun berikutnya", "pengisian kinerja"],
  },
  {
    id: "pupr7-tanggung-jawab", page: 9, locator: "Pasal 17 — PDF hlm. 9",
    excerpt: "Pasal 17 pada salinan menyebut tanggung jawab BUJK atas pengisian LKUT; pengisian kinerja penyedia jasa tahunan untuk BUJK menengah, besar dan spesialis; keikutsertaan PUB sesuai daftar prioritas asosiasi; serta pemenuhan kewajiban sebagai anggota. Pembinaan dimaksudkan untuk peningkatan kemampuan profesional dan usaha.",
    limitation: "Keanggotaan asosiasi, pencatatan kegiatan PUB dan pelaporan LKUT merupakan hal berbeda. Tautan asosiasi atau catatan di aplikasi bukan bukti keanggotaan aktif, penerimaan laporan, atau keputusan asosiasi/LSBU.",
    terms: ["tanggung jawab bujk", "pasal 17", "kewajiban anggota", "daftar prioritas asosiasi", "keikutsertaan pub"],
  },
  {
    id: "pupr7-format-lkut", page: 11, locator: "Lampiran A angka 1–2 — PDF hlm. 11–12 dan 14 (cuplikan)",
    excerpt: "Cuplikan format LKUT pada salinan memisahkan data kepatuhan perizinan dari data kinerja manajemen perusahaan. Bagian BUJK nasional mencakup kepemilikan SBU, penggantian TKK, komitmen peralatan, SMAP dan pencatatan pengalaman. Halaman 12 meneruskan kriteria serah terima pengalaman. Halaman 14 mulai memuat data keuangan seperti aset, penjualan, laba, kewajiban, ekuitas dan arus kas serta bukti penerapan tata kelola.",
    limitation: "Ini cuplikan lampiran, bukan seluruh format 169 halaman atau checklist lengkap untuk semua bentuk/jenis usaha. Nomenklatur jabatan dan rujukan peraturan lama pada lampiran perlu dicocokkan dengan skema serta aturan terkini. Tidak memverifikasi dokumen atau menggantikan pengisian SIJK.",
    terms: ["format lkut", "lampiran a", "data kepatuhan", "kinerja manajemen perusahaan", "data keuangan", "serah terima pengalaman"],
  },
] as const;

export const PUPR7_SOURCE: ChatSourceVersion = {
  sourceKey: "permen-pupr-7-2024", versionId, baseline: true,
  citations: entries.map(e => ({
    id: `${e.id}@${versionId}`,
    document: "Permen PUPR Nomor 7 Tahun 2024 — Pengembangan Usaha Berkelanjutan",
    version: "Salinan unggahan; 169 halaman PDF; kurasi 4 November 2026",
    locator: e.locator, excerpt: e.excerpt,
    sourceUrl: "https://jdih.pu.go.id/",
    checkedOn: "2026-11-04",
    verificationStatus: "unverified",
    verificationScope: "Teks dan halaman terpilih salinan diperiksa; bukan autentikasi penerbit atau verifikasi status hukum terkini.",
    documentStatus: "Salinan peraturan sebagai referensi primer; keaslian, perubahan dan penerapan terkini belum diverifikasi.",
    limitation: `${e.limitation} Tautan JDIH adalah kanal rujukan, bukan URL berkas penerbit yang telah diautentikasi.`,
  })),
  keywords: Object.fromEntries(entries.map(e => [`${e.id}@${versionId}`, [...e.terms]])),
};
