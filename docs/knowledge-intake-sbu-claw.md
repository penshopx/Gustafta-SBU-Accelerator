# Penerimaan knowledge base SBU-CLAW

**Status: draf kurasi; belum diaktifkan untuk retrieval, prompt runtime, atau penilaian.**

## Cakupan pemeriksaan

Unggahan berisi satu spesifikasi teks dan 13 PDF. Spesifikasi dibaca lengkap.
Seluruh PDF berhasil dibuka, dihitung halamannya, diambil identitas teks
sampulnya, dan dibandingkan SHA-256 dengan PDF langsung sebelumnya di
`attached_assets/`. Sampul paparan Kepdirjen dan skema BG diperiksa visual.
Ini bukan telaah seluruh halaman, autentikasi penerbit, atau verifikasi
keberlakuan hukum terkini.

## Inventaris dan deduplikasi

Nama lengkap sumber tersedia di `attached_assets/`; akhiran berikut
mengidentifikasi unggahan ini secara tepat. Seluruh 13 PDF identik byte
dengan setidaknya satu PDF langsung yang sudah ada. Jangan membuat versi
substansi baru hanya karena nama unggahan berubah, atau mengaktifkan kembali
sumber yang pernah dicabut.

| Dokumen | Akhiran unggahan | Halaman PDF | Peran sementara |
| --- | --- | ---: | --- |
| PP 28/2025 | 1793064752315.pdf | 383 | Salinan sumber primer |
| Permen PU 6/2025 | 1793064858948.pdf | 393 | Salinan sumber primer |
| Kepdirjen BK 281 dan pengantar | 1793064932746.pdf | 186 | Salinan sumber primer/lampiran |
| Paparan Kepdirjen | 1793064680270.pdf | 34 | Sosialisasi; konflik nomor pada sampul |
| Slide pendukung Ketua LPJK | 1793064680276.pdf | 13 | Sosialisasi |
| Skema BG | 1793064962677.pdf | 206 | Skema institusional LSBU Konstruksi Indonesia |
| Skema BS | 1793064962678.pdf | 218 | Skema institusional |
| Skema IN | 1793064962679.pdf | 214 | Skema institusional |
| Skema KK | 1793064962680.pdf | 213 | Skema institusional |
| Skema KP | 1793064962681.pdf | 208 | Skema institusional |
| Skema PA | 1793064962682.pdf | 206 | Skema institusional |
| Skema PL | 1793064962682.pdf | 208 | Skema institusional |
| Skema PB | 1793064962683.pdf | 208 | Skema institusional |

Untuk hash dan pasangan duplikat 12 sumber selain PP, lihat
`knowledge-intake-2026-10-26.md`. PP identik dengan
`PP_Nomor_28_Tahun_2025_1791292183987.pdf`, SHA-256
`8808de485eab2499cf3d8369921c097beaea68ae55aa767c61095d47a5a118fb`.

## Spesifikasi perilaku bukan sumber norma

`Pasted--SBU-CLAW-Asisten-Regulasi-Studi-Kasus-Sertifikasi-Bada_1793064544542.txt`
adalah kandidat spesifikasi, bukan bukti hukum atau instruksi runtime aktif.
Dokumen mengusulkan delapan fungsi: Regulasi, Proses, Kriteria, Transisi,
Kasus, Gap, Integritas, dan LSBU. Ini berbeda dari sepuluh spesialis pada
referensi sebelumnya; rekonsiliasi desain diperlukan sebelum implementasi.

Bagian 2–3 dan 5–7 memuat batas kewenangan, privasi, pemisahan bunyi aturan
dari interpretasi, dan format studi kasus yang dapat ditelaah untuk adopsi.
Persona praktisi 30 tahun tidak boleh menjadi klaim pengalaman nyata AI.
Daftar tool pada bagian 4 adalah harapan, bukan bukti tool tersedia.
Spesifikasi ini tidak mengganti keputusan model utama Claude.

Lampiran A memuat klaim substantif dari materi sosialisasi. Setiap klaim
tetap perlu dipasangkan ke sumber primer dan locator sebelum menjadi
pengetahuan operasional atau aturan. Khususnya:

- Tenggat transisi: jangan mengaktifkan tanggal perkiraan dari slide.
- Pengalaman dua periode, penolakan perpanjangan dan masa tunggu: tetap
  mengikuti batas draf BG001 dan pertanyaan telaah yang belum dituntaskan.
- Ambang kualifikasi/keuangan, bentuk badan usaha, modal asing, rangkap
  personel, peralatan dan waktu pemenuhan SMAP: jangan mengambil angka
  lampiran prompt sebagai tabel persyaratan terverifikasi.
- Pilihan bukti SMAP/PANCEK harus dicocokkan dengan ketentuan relevan;
  tidak boleh disimpulkan otomatis saling menggantikan.

## Konflik identitas dan locator awal

- Paparan Kepdirjen, PDF 1: visual sampul menulis **281/KPTS/M/2026**.
- Salinan Kepdirjen/pengantar, PDF 1: teks menyebut
  **281/KPTS/DK/2026**. Perbedaan disimpan, tidak dikoreksi diam-diam.
- Skema BG, PDF 1: visual menunjukkan **LSBU Konstruksi Indonesia**.
  Delapan skema bukan otomatis standar universal semua LSBU.

Nomor PDF dan cetak harus dicatat terpisah saat kurasi cuplikan.
Persetujuan retrieval, autentikasi sumber, dan aktivasi aturan merupakan
keputusan terpisah.

## Dampak aplikasi

Hanya menambah catatan penerimaan ini. Tidak mengubah prompt, katalog aktif,
database, kasus lama, integrasi, model, atau deployment. Tidak mengirim
isi unggahan ke AI berbayar dan tidak menyalin PDF ke direktori public.

Langkah berikutnya adalah kurasi terarah per modul dengan kutipan, locator,
scope, konflik, dan pertanyaan telaah; bukan impor seluruh isi tanpa review.
