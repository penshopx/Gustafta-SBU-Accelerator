# Prioritas operasional SBU Accelerator

Tanggal: 20 Oktober 2026.

## Tujuan dan batas rencana

Arahan pengguna: operasional sebagai **knowledge, studi kasus, dan pendampingan
proses sertifikasi badan usaha jasa konstruksi**.

Ini rencana pekerjaan berdasarkan audit kode, bukan laporan implementasi,
penugasan baru dalam antrean, persetujuan regulasi, atau izin publish. Estimasi
70% pada audit adalah estimasi berbobot, bukan ukuran kelulusan produksi.

Gunakan modul yang sudah ada. Penyimpanan SBU tetap mandiri; integrasi Gustafta,
login/submit OSS atau SIJK otomatis, dan pengambilan data perusahaan eksternal
tidak termasuk cakupan. Jangan mengubah kasus lama atau mengaktifkan draf aturan.

Dua tingkat layanan harus dibedakan:

- **Panduan persiapan:** pengetahuan bersumber, pembelajaran kasus, pencatatan
  dokumen dan tindak lanjut; dapat diuji coba tanpa mengklaim semua aturan aktif.
- **Pemeriksaan persyaratan substantif:** hanya untuk cakupan dan versi aturan
  yang sudah ditelaah serta disetujui. Cakupan belum lengkap menghasilkan
  "belum dapat disimpulkan", bukan siap, tidak layak, atau skor 100%.

## P0 — Stabilkan alur dasar dan tentukan cakupan

**Pekerjaan**

1. Diagnosis workflow frontend/API yang dilaporkan gagal, bedakan kegagalan
   lingkungan pengembangan dari kondisi produksi. Jangan mengganti autentikasi
   atau memperlebar kepercayaan proxy tanpa bukti.
2. Verifikasi perjalanan sintetis: masuk → profil → buat kasus → simpan dokumen
   → catat personel/SKK → konsultasi → Workroom → tinjauan internal → ekspor.
3. Periksa pemisahan akun, pergantian sesi, kegagalan simpan, dan pemulihan
   tanpa kehilangan draf. Reuse regresi yang sudah ada sebelum menambah tes.
4. Usulkan cakupan pilot terbatas, misalnya persiapan BG001 BUJKN, untuk
   persetujuan pemilik dan penelaah. Jangan menganggap calon cakupan sudah sah.
5. Pastikan konfigurasi AI/anggaran dan pemindai valid melalui pemeriksaan
   operasional yang tidak menampilkan secret atau dokumen privat.

**Kriteria selesai:** alur inti memiliki hasil uji tercatat; kegagalan memberi
pesan dan dapat dipulihkan; tidak ada kebocoran akun; cakupan dan batas klaim
terlihat jelas. Verifikasi produksi dilakukan terpisah setelah publikasi pemilik.

## P1 — Jadikan pusat pengetahuan dapat dipakai

**Pekerjaan**

1. Reuse Pusat Regulasi dan sumber chatbot untuk pencarian/filter sumber menurut
   topik, jenis sumber, versi, cakupan, dan status telaah.
2. Tampilkan dokumen, nomor/tahun, locator PDF/cetak yang dibedakan, tautan
   sumber yang diizinkan, tanggal pemeriksaan, dan batas verifikasi.
3. Pisahkan primer, referensi KBLI, panduan, praktik lembaga, dan materi
   dikecualikan. Edisi KBLI wajib; hubungan ke subklasifikasi memakai skema resmi.
4. Hubungkan panduan dengan Klinik menggunakan pilihan pengguna; jangan
   otomatis mengirim profil, kasus atau dokumen.
5. Reuse mekanisme pencabutan sumber yang sudah digabungkan. Antarmuka penelaah
   dan penandaan kutipan historis mengikuti pekerjaan yang sudah mengantre.
6. Telaah BG001 mengikuti antrean periode pengalaman, alokasi kontrak, dan
   konflik sumber; jangan menduplikasi atau memutuskan gap lewat AI.

**Kriteria selesai:** pengguna menemukan panduan, membuka rujukan, dan membedakan
apa yang ditelaah versus belum. Chatbot menolak kutipan yang tidak tersedia;
persetujuan retrieval tidak dianggap pengesahan hukum.

## P1 — Bangun pustaka studi kasus yang tertelaah

**Pekerjaan**

1. Periksa kembali inventaris kandidat 150 skenario draf; jangan menganggapnya
   kasus nyata atau mengimpor seluruh paket sebagai materi final.
2. Usulkan batch awal sekitar 10 skenario SBU terpilih: baru, perpanjangan,
   perubahan data, dokumen kurang, personel/SKK, pengalaman, dan ketidakpastian
   penerapan. Skenario tidak boleh mengarang syarat untuk menutup gap sumber.
3. Setiap studi kasus memuat jenis usaha, klasifikasi/subklasifikasi, edisi KBLI
   bila relevan, jenis permohonan, fakta/asumsi, masalah, langkah, sumber,
   pembahasan, batas kesimpulan, versi dan status telaah.
4. Labeli "simulasi pembelajaran" atau "kasus nyata dianonimkan" secara berbeda.
   Kasus nyata memerlukan izin dan pemeriksaan risiko identifikasi ulang.
5. Jika menyediakan "Gunakan sebagai latihan", buat ruang/data latihan yang
   terpisah dan jelas berlabel; jangan menyalin menjadi fakta permohonan nyata.
6. Sediakan pencarian/filter dan alur draf → telaah → terbit → revisi/cabut.

**Kriteria selesai:** batch awal ditelaah manusia, tidak memuat identitas nyata,
memiliki locator yang dapat dibuka, dan tidak memengaruhi penilaian kasus privat.

## P2 — Satukan pendampingan per kasus

**Pekerjaan**

1. Reuse detail kasus dan Workroom untuk menampilkan tahapan: identifikasi
   kebutuhan → dokumen/personel → telaah kekurangan → perbaikan → tinjauan
   internal → ringkasan persiapan → pencatatan tindak lanjut pengajuan.
2. Tautkan temuan dengan tindakan, sumber/versi, PIC internal, target waktu,
   dan referensi bukti perbaikan. Hitung ulang tidak menggandakan tindakan.
3. Tugas selesai atau berkas diunggah tidak otomatis berarti syarat terpenuhi.
   Persetujuan internal tetap berbeda dari keputusan LSBU/OSS.
4. Reuse Klinik dan Bedah Dokumen dengan cuplikan pilihan dan persetujuan
   eksplisit. Hasil AI draf tidak mengubah status bukti/penilaian otomatis.
5. Tampilkan bahan berubah dan kebutuhan tinjau ulang; pertahankan keputusan
   historis terikat pada snapshot semula.
6. Tahap awal tetap satu pemilik. Bila pendamping manusia perlu akses langsung,
   rancang penugasan, lingkup, persetujuan, kedaluwarsa, pencabutan, serta audit
   server-side sebelum membuka akses; label peran tidak cukup.

**Kriteria selesai:** satu kasus dapat ditelusuri dari kekurangan sampai tindak
lanjut dan tinjauan. Tidak ada pengajuan eksternal otomatis atau akses lintas
akun tanpa izin. Pendampingan mandiri/AI tidak dipasarkan sebagai telaah ahli.

## P2 — Lengkapi laporan hasil pendampingan

**Pekerjaan**

1. Reuse ringkasan dan pencetakan yang ada, termasuk personel/SKK.
2. Tambahkan identitas/versi laporan, cakupan, waktu acuan, dokumen yang
   dipilih, temuan, tindak lanjut/PIC, sumber, dan catatan tinjauan.
3. Bedakan deklarasi pengguna, hasil AI, tinjauan internal, dan telaah ahli
   bila layanan ahli kelak tersedia. Tampilkan keterbatasan dan bahan usang.
4. Uji snapshot konsisten serta ekspor laporan kekurangan, bukan hanya kasus
   lengkap. Contoh publik memakai data sintetis berlabel.

**Kriteria selesai:** laporan dapat dipahami tanpa membuka chat, sumber dapat
ditelusuri, dan hasil cetak tidak menyatakan aplikasi sebagai penerbit SBU.

## P3 — Buktikan operasional melalui pilot terbatas

**Pekerjaan**

1. Siapkan panduan pengguna, kanal bantuan nyata, kebijakan privasi/retensi,
   serta prosedur gangguan login, AI, pemindai dan penyimpanan.
2. Buktikan backup/restore database dan dokumen terkait di lingkungan terisolasi.
   Versi berkas dan pembersihan objek yatim bukan pengganti backup.
3. Reuse anggaran AI gabungan dan antrean peringatan/tarif. Ukur kegagalan,
   biaya serta penyelesaian alur tanpa mencatat isi privat.
4. Usulkan pilot 3–5 pengguna yang mewakili BUJK dan pendamping; angka ini
   target usulan, bukan klaim pengguna atau hasil yang sudah diperoleh.
5. Catat keberhasilan mencari panduan, memahami studi kasus, menuntaskan
   tindakan, dan menghasilkan laporan. Tutup penghambat berdasarkan bukti.
6. Jalankan verifikasi produksi setelah publikasi yang disetujui pemilik.
   Pembayaran/berlangganan bukan syarat pilot nonkomersial; jika pilot berbayar,
   lingkup layanan, order, harga, hak akses dan pengaduan harus disetujui dahulu.

**Kriteria selesai:** hasil pilot dan keterbatasan terdokumentasi; risiko kritis
ditutup; cakupan didukung jelas; pemilik memutuskan rilis. Tidak ada klaim
kelulusan produksi hanya dari status MERGED atau keberadaan tes.

## Urutan pelaksanaan dan pencegahan duplikasi

1. P0 diselesaikan terlebih dahulu.
2. Pusat pengetahuan dan studi kasus dapat dikembangkan paralel setelah standar
   sumber/telaah disepakati. Publikasi materi menunggu telaah, bukan full engine.
3. Pendampingan per kasus memakai pengetahuan yang sudah diterbitkan; laporan
   mengikuti kontrak temuan/tindakan. Aturan substantif aktif memiliki gerbang
   persetujuan sendiri dan bukan syarat untuk semua materi pembelajaran.
4. Pilot dilakukan setelah alur utama, batas klaim dan pemulihan aman terbukti.

Pekerjaan antrean yang sudah diketahui—telaah BG001, sumber chatbot, kuota,
anggaran, antivirus, batas Bedah Dokumen lintas proses, dan regresi CRUD—tetap
dimiliki tugas masing-masing. Rencana ini tidak mengambil alih, menggandakan,
atau mengubah statusnya. Sebelum penugasan implementasi, cocokkan ulang antrean
terbaru; status yang tercatat dalam percakapan dapat berubah.

Tidak memprioritaskan penambahan banyak chatbot, seluruh subklasifikasi sekaligus,
white-label, integrasi Gustafta, atau otomatisasi pengajuan. Ukuran keberhasilan
awal adalah pengguna bisa **belajar → memahami contoh → menyiapkan kasus →
menindaklanjuti kekurangan → meninjau dan mengekspor hasil** dengan batas yang jelas.
