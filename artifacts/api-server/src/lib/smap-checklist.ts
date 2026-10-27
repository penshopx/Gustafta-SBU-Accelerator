export const SMAP_TEMPLATE = "smap-example-internal-1";
export const SMAP_DISCLAIMER = "Draf persiapan/telaah internal dari contoh checklist. Identitas peraturan induk dan keberlakuan belum dipastikan. Bukan persyaratan wajib, sertifikasi ISO, konfirmasi PANCEK/KPK, atau persetujuan SBU. Tidak menghitung kelulusan.";
const groups = ["Komitmen", "Perencanaan", "Pelaksanaan", "Evaluasi"];
const rows = [
  [
    ["Adakah komitmen tertulis manajemen puncak?", "Pernyataan komitmen yang disahkan", "Periksa pihak berwenang, tanggal, versi dan cakupan."],
    ["Adakah pernyataan antipenyuapan untuk seluruh pegawai?", "Klausul kontrak/formulir dan rekam penerapan", "Template berbeda dari rekam pelaksanaan; jelaskan cakupan pegawai."],
    ["Adakah kebijakan tertulis mengacu ISO 37001:2016 dan/atau UU Tipikor?", "Kebijakan dan daftar rujukan", "Edisi dalam contoh bukan verifikasi standar terkini."],
    ["Apakah kebijakan mendefinisikan suap/penyuapan?", "Bagian definisi kebijakan", "Tunjuk halaman, bukan sekadar judul berkas."],
    ["Apakah kebijakan menjelaskan area kemungkinan penyuapan?", "Kebijakan dan peta area rawan", "Periksa relevansi terhadap aktivitas badan usaha."],
    ["Adakah fungsi/unit pencegahan penyuapan?", "Penetapan fungsi dan uraian tugas", "Periksa kewenangan dan tanggung jawab, bukan nama saja."],
    ["Apakah fungsi tersebut bertanggung jawab atas audit internal?", "Pengaturan audit dan uraian tugas", "Tinjau kompetensi dan konflik kepentingan."],
    ["Apakah fungsi tersebut melaksanakan sanksi dan penghargaan?", "Prosedur dan rekaman yang relevan bila ada", "Nihil kejadian tidak boleh diisi bukti fiktif."],
    ["Apakah fungsi tersebut melakukan komunikasi dan pelatihan?", "Materi, agenda dan rekam pelaksanaan", "Periksa peserta, periode dan pelaksanaan."],
  ],
  [
    ["Adakah identifikasi risiko, titik rawan dan modus penyuapan?", "Register risiko dan metodologi", "Hubungkan risiko dengan proses usaha."],
    ["Apakah penilaian risiko mencakup seluruh aktivitas?", "Daftar proses dan cakupan penilaian", "Jelaskan aktivitas belum tercakup."],
    ["Apakah penilaian risiko diperbarui berkala?", "Riwayat peninjauan risiko", "Jangan mengarang frekuensi yang tidak disebut sumber."],
  ],
  [
    ["Adakah uji tuntas risiko korupsi atas karyawan dan pihak usaha terkait?", "Prosedur dan sampel tersamarkan", "Lindungi identitas; tinjau cakupan pihak terkait."],
    ["Apakah kebijakan mengikat pihak eksternal terkait?", "Kontrak, kode etik mitra dan penerimaan", "Periksa pihak terikat dan cara pemberlakuan."],
    ["Apakah kebijakan mencakup pengawasan, sanksi dan evaluasi?", "Prosedur pengawasan dan tindak lanjut", "Bedakan mekanisme dengan tindakan yang sudah dilaksanakan."],
    ["Adakah pengaturan gratifikasi, dana politik dan konflik kepentingan?", "Kebijakan dan formulir deklarasi", "Periksa tiap pokok, bukan judul kebijakan saja."],
    ["Adakah pengaduan yang menjaga kerahasiaan dan keamanan pelapor?", "Prosedur dan pengendalian akses", "Jangan lampirkan identitas pelapor/isi laporan nyata."],
    ["Adakah pencatatan dan arsip keuangan/administrasi yang transparan dan patuh UU Tipikor?", "Prosedur dan sampel tersamarkan", "Bukan opini audit keuangan atau kesimpulan kepatuhan hukum."],
    ["Apakah kebijakan disosialisasikan berkala kepada seluruh pegawai?", "Rekam sosialisasi dan cakupan penerima", "Periksa periode dan versi materi."],
  ],
  [
    ["Adakah sistem pemantauan/evaluasi antipenyuapan?", "Prosedur, indikator dan hasil evaluasi", "Bedakan sistem dengan evaluasi yang telah terjadi."],
    ["Apakah sistem evaluasi dikomunikasikan kepada pegawai?", "Materi dan rekam komunikasi", "Periksa penerima dan periode."],
    ["Apakah hasil evaluasi dikomunikasikan kepada manajemen?", "Notulen/ringkasan pembelajaran", "Periksa tindak lanjut; batasi isi sensitif."],
    ["Apakah korporasi mempunyai Komite Audit?", "Pembentukan dan mandat, bila ada", "Pertanyaan contoh, bukan kewajiban universal seluruh BUJK."],
  ],
];
export const smapQuestions = rows.flatMap((items, group) => items.map(([text, suggestedEvidence, reviewFocus], i) => ({
  id: `SMC-${["I", "II", "III", "IV"][group]}-${String(i + 1).padStart(2, "0")}`,
  group: groups[group], text, suggestedEvidence, reviewFocus,
  source: `Contoh checklist SMAP, A.2 ${["I", "II", "III", "IV"][group]}.${i + 1}; PDF/cetak ${group < 2 ? 2 : 3}. Kode lokal, bukan indikator resmi PANCEK.`,
})));
