# Rencana kriteria terima adaptasi fitur SBU

Tanggal: 10 Oktober 2026  
Status: **rencana pemeriksaan untuk implementasi kelak — tidak dijalankan pada giliran peta adaptasi**.

## 1. Batas bukti

Pemetaan sumber kode tidak membuktikan seluruh alur runtime, produksi, retensi,
pencabutan sesi, atau izin organisasi. Keberhasilan uji yang pernah dilaporkan
untuk Ruang Simpan/Bedah Dokumen hanya berlaku dalam cakupan pengujian saat itu.
Perubahan berikutnya harus diverifikasi sesuai risiko, bukan mewarisi label
“lulus” untuk semua modul.

Hasil verifikasi kelak dipisahkan menjadi:

- **Terbukti — implementasi:** kode/API/UI/persistensi ditemukan, dengan batas jelas.
- **Terbukti — pemeriksaan:** skenario benar-benar dijalankan, lingkungan dan
  data uji disebutkan tanpa identitas pribadi atau credential.
- **Gagal:** perilaku yang diamati tidak memenuhi kriteria.
- **Belum terverifikasi:** tidak dijalankan, tidak memenuhi prasyarat, atau
  skenario teknis tidak benar-benar terjadi.

## 2. Pemeriksaan lintas fitur

| Kriteria | Perilaku yang harus dibuktikan setelah perubahan | Penerapan |
|---|---|---|
| Sesi dan peran | Tanpa sesi ditolak; aktor berasal dari autentikasi server; payload klien tidak memberikan hak administrator. | Seluruh API privat. |
| Dua pemilik | B tidak membaca/mengubah/mengunduh/menghapus/mengekspor objek A lewat ID, pencarian, daftar, agregasi atau URL. | Profil, kasus, dokumen, analisis, workroom, laporan. |
| Respons tertunda | Identitas dan kasus diikat saat permintaan dibuat; respons lama/berbeda tidak masuk cache aktif atau menampilkan kilasan privat. Termasuk A → B → A. | Daftar, detail, cache, modal dan ekspor. |
| Pemulihan halaman | BFCache nyata dibuktikan dengan event native yang sesuai; selama verifikasi identitas, data tetap tertutup. Simulasi event bukan bukti BFCache. | Halaman privat yang berubah; ikuti tugas browser yang sudah antre. |
| Konflik perubahan | Revisi lama ditolak jika optimistic concurrency diterapkan; dua editor tidak menimpa tanpa penjelasan. | Profil, metadata dan draft workroom sesuai desain kelak. |
| Retry/idempotensi | Efek bisnis/audit/pengingat tidak berlipat karena klik ulang atau retry. Payload berbeda dengan kunci yang sama ditolak bila idempotency key digunakan. | Mutasi dan gerbang/eksekusi/notifikasi baru. |
| Gagal provider/storage | Kegagalan ditampilkan jujur, draft dipertahankan, tidak ada status sukses palsu. Gangguan jaringan tidak dianggap bukti mutasi belum terjadi. | Upload, AI, export, notifikasi. |
| Audit | Aktor sah, objek/revisi, waktu dan hasil konsisten dengan aksi. Tidak memuat token, signed URL, isi lengkap dokumen atau prompt sensitif. | Aksi bisnis yang dipilih untuk diaudit. |
| Persistensi | Metadata/versi/hasil/tugas yang berhasil disimpan tetap tersedia setelah reload; persistensi setelah restart layanan diperiksa terpisah jika relevan. | Modul yang dibuat/diubah. |
| Injeksi dokumen | Instruksi dalam dokumen/RAG tidak menaikkan izin, memanggil tool terlarang, atau mengambil data lain. | Bedah Dokumen dan bantuan bersumber. |
| Ekspor | Isi sesuai snapshot yang berizin, karakter/HTML disanitasi, format benar-benar didukung. Cetak native dan pagination adalah pemeriksaan berbeda. | Laporan dan generator. |
| Mode mandiri | Tidak ada panggilan, worker, sinkronisasi atau grant ke Gustafta yang diaktifkan oleh adaptasi. | Seluruh perubahan. |
| Modul tidak dipilih | Tidak ada menu aktif palsu, provider/worker baru atau endpoint bisnis untuk modul yang dikecualikan. | Pemilihan kit. |
| Pemeriksaan kode | Typecheck/build dan uji terfokus relevan lolos setelah perubahan; sumber codegen dan deklarasi build tidak disamakan. | Implementasi yang kelak disetujui. |

Pemeriksaan gate revisi/pencabutan grant hanya dapat dilakukan ketika alur tersebut
sudah dibangun. Tidak adanya modul adalah **tidak berlaku/belum dibuat**, bukan
hasil lulus.

## 3. Kriteria khusus tahap yang direkomendasikan

### Dokumen, masa berlaku dan pengingat

- Tanggal diketahui, tidak memiliki masa berlaku, dan tanggal belum diketahui
  memiliki arti berbeda; status “aktif” tidak muncul hanya karena kolom kosong.
- Definisi tanggal akhir, zona kalender, ambang “segera habis”, serta batas tepat
  pada hari kedaluwarsa diputuskan dan diuji. Tidak menebak kebijakan hukum.
- Nilai tanggal dapat ditambah, diubah, dikosongkan sesuai makna, dan dibaca kembali
  tanpa pergeseran kalender. Jangan menduplikasi tugas tanggal yang sudah antre.
- Pengingat mengikuti pemilik, versi dokumen dan kebijakan yang digunakan.
  Revisi tanggal/versi baru tidak menyisakan pengingat yang menyesatkan.
- Inbox lokal persisten dan berizin. Email/WhatsApp tidak diaktifkan pada tahap ini.
- Perhitungan on-demand boleh digunakan untuk daftar prioritas; jika pengiriman
  terjadwal dipilih kemudian, mekanisme durable dan deduplikasi wajib dibuktikan.

### Workroom privat dan tinjauan manusia

- Pekerjaan terikat kasus milik pengguna, dapat dibuat/diubah/dibuka kembali, dan
  memiliki status serta tenggat yang jelas; tidak menduplikasi sumber kasus.
- Bukti yang hilang atau masih pending tidak dianggap memenuhi pekerjaan.
- Tinjauan merekam aktor, revisi/versi sumber, waktu dan alasan sesuai kebijakan.
- Perubahan sumber menandai keputusan lama tidak berlaku untuk revisi baru.
- AI tidak menyetujui atas nama manusia. Selesai persiapan bukan persetujuan LSBU.
- Pembagian tugas lintas orang tidak dibuka sebelum membership/izin dibuat.

### Bantuan bersumber, Bedah Dokumen dan Klinik

- Pengguna memilih konteks yang akan dikirim; profil/seluruh arsip tidak otomatis
  menjadi konteks hanya karena membuka percakapan.
- Persetujuan pemrosesan AI serta batas biaya/ukuran ditampilkan sebelum panggilan.
- Rujukan dapat dibuka oleh pengguna berizin, menyebut sumber dan versi yang benar.
  AI tidak mengarang kutipan/pasal ketika dukungan sumber tidak tersedia.
- Pernyataan ekstraksi, indikasi masalah, review manusia dan status bukti dipisahkan.
- Hasil tersimpan mengacu ke dokumen/versi asli; perubahan atau penghapusan sumber
  mempunyai perilaku yang ditentukan, bukan diam-diam berpindah ke berkas lain.
- Percakapan kasus tersimpan tidak berbagi riwayat antar pemilik.
- Konsultasi manusia dibedakan dari jawaban AI; akses penerima eksternal adalah
  prasyarat baru, bukan efek memilih mode “konsultan”.

### Laporan dan draf

- Snapshot data lokal dan revisinya jelas; fakta yang belum diisi tidak dikarang.
- Label draf dan batas “persiapan” tampil pada preview serta ekspor.
- Laporan tidak mencantumkan penerbitan SBU, tanda tangan, atau status legalitas
  yang tidak berasal dari proses berwenang.
- HTML/cetak yang sudah ada tidak dilabeli DOCX atau file PDF server.

## 4. Cara verifikasi kelak

Gunakan data sintetis dan isolasi database yang sesuai. Siapkan cleanup terbatas
sebelum membuat akun/berkas uji; pisahkan kegagalan pengujian dari cleanup.
Jangan menulis ke data produksi untuk membuktikan skenario.

Prioritaskan pemeriksaan murah seperti typecheck, uji API/SQL terisolasi, dan
pemeriksaan output. Pengujian browser digunakan untuk alur kritis yang tidak
dapat dibuktikan cara tersebut; satu pass terfokus untuk perubahan terkait.
Snapshot visual tidak membuktikan interaksi, autentikasi, atau penghapusan berhasil.

Dokumen ini tidak mengantrekan tugas baru, menjalankan pemeriksaan, ataupun
mengubah tugas regulasi/keamanan yang sudah ada.
