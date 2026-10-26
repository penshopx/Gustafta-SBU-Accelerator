# Asisten Pakar SBU — tujuan percakapan

Asisten memakai satu layanan chat yang sudah ada, bukan enam agen bebas
bertindak atau enam model terpisah. Tiga pilihan berikut mempunyai fungsi
berbeda dan tidak memberi hak akses:

- `mode`: sudut pandang peran (BUJK, pendamping, asesor, LSBU, asosiasi, umum).
- `purpose`: tujuan percakapan, enam pilihan di bawah.
- `specialist`: fokus topik yang sudah tersedia.

## Enam tujuan

| Nilai API | Nama | Bentuk bantuan yang diarahkan |
| --- | --- | --- |
| `tutor_regulasi` | Tutor Regulasi | Penjelasan, sumber/locator, batas verifikasi, pertanyaan pemahaman |
| `permohonan_baru` | Panduan Permohonan Baru | Klarifikasi jenis permohonan, checklist, kondisi deklarasi, urutan persiapan |
| `perpanjangan` | Panduan Perpanjangan SBU | Konteks masa berlaku/periode, gap bukti dan pertanyaan LSBU; bukan penolakan otomatis |
| `pemeriksa_dokumen` | Pemeriksa Dokumen | Pemeriksaan cuplikan anonim yang benar-benar diberikan; temuan konsistensi dan hal yang tidak dapat diperiksa |
| `studi_kasus` | Pakar Studi Kasus | Fakta deklarasi, asumsi, isu, analisis bersumber, alternatif dan risiko |
| `pendamping_proses` | Pendamping Proses | Prioritas, checklist kerja, usulan tanggung jawab/dependensi, draf komunikasi |

Setiap tujuan mempunyai instruksi server yang berbeda untuk pertanyaan awal
dan struktur hasil. AI tetap generatif: instruksi dan pengujian sintetis tidak
membuktikan semua jawaban model nyata selalu benar. Kutipan jawaban tetap
divalidasi menggunakan sumber retrieval yang masih aktif.

## Kontrak dan kompatibilitas

`POST /api/openai/sbu/messages` menerima `purpose` opsional untuk kompatibilitas
klien lama. Tanpa nilai, server memakai `tutor_regulasi`. Nilai lain/null ditolak
sebelum reservasi atau panggilan provider. Respons sukses mengembalikan
`purpose` server bersama pemilik sesi, peran dan spesialis.

Frontend mengirim tujuan terpilih dan menolak respons yang tidak sesuai
tujuan permintaan. Pergantian tujuan/peran/spesialis yang memiliki draf atau
riwayat meminta konfirmasi sebelum mengosongkan percakapan; membatalkan
konfirmasi mempertahankan isian. Contoh pertanyaan mengisi draf saja dan
tidak otomatis memanggil AI. Saat ada permintaan berjalan, perubahan
pilihan dinonaktifkan.

Kuota akun dan anggaran operasional tetap bersama, tidak direset atau
digandakan karena mengganti tujuan. Claude Sonnet 5.5 tetap model Asisten;
Klinik Konsultasi dan modul lain tidak dipindahkan modelnya oleh perubahan
ini. Pemanggil helper lama yang tidak memasukkan tujuan mempertahankan
instruksi sebelumnya.

## Batas pemeriksaan dokumen dan tindakan

Mode Pemeriksa Dokumen **tidak membaca unggahan secara otomatis**. Pengguna
dapat tetap menulis cuplikan anonim, atau mengaktifkan pilihan **Gunakan hasil
Bedah Dokumen** yang awalnya mati. Daftar kasus/dokumen/analisis baru dibaca
setelah pengguna memilih alur tersebut. Pengguna memilih satu kasus miliknya,
dokumen bersih/ready, satu analisis versi saat ini, lalu meninjau cuplikan
berurutan maksimal 4.000 karakter dan referensi persisnya.

Persetujuan khusus cuplikan terpisah dari persetujuan pengiriman pesan ke
Claude. Mengubah cuplikan membatalkan persetujuannya. Saat bahan dipilih,
pengiriman dinonaktifkan sampai pilihan lengkap dan disetujui. Setelah ada
riwayat atau selama permintaan berlangsung, bahan terkunci; menggantinya
memerlukan percakapan baru yang membersihkan pilihan/persetujuan lama.

Kontrak `analysisContext` membawa `caseId` dan `selection` (ID dokumen dan
analisis, revision hash, cuplikan, consent=true). Hanya tujuan
`pemeriksa_dokumen` yang menerimanya. Server memakai pemeriksaan sumber
privat yang sama dengan Klinik: pemilik kasus/dokumen/analisis, status scan,
versi dokumen dan hash hasil/referensi, serta kecocokan cuplikan. Hanya
cuplikan dan referensi server yang masuk konteks AI, bukan nama berkas,
storage path, profil, isi dokumen asli atau analisis lain.

Pemeriksaan awal berlangsung sebelum reservasi kuota/anggaran. Pemeriksaan
ulang sebelum jawaban dikembalikan menahan jawaban jika sumber berubah
selama AI bekerja. Penolakan awal tidak memanggil AI; percobaan yang sudah
terkirim tetap memakai kuota. Identitas sumber tidak membuktikan keaslian
sertifikat atau validitas hukum hasil analisis.

Respons sukses mengembalikan pilihan yang dipakai; klien menolak pilihan
hilang/berbeda/tambahan yang tidak disetujui. Snapshot bahan berada di memori
halaman dan payload pengiriman ini saja, tidak membuat konsultasi atau
menyimpan salinan baru pada database. Alur Klinik yang menyimpan snapshot
tetap terpisah. Penghapusan sumber tidak menghapus teks jawaban lama yang
telah diterima di memori halaman, tetapi pengiriman berikutnya wajib
memvalidasi sumber lagi; tidak ada pengambilan berkas ulang otomatis.

Kelengkapan/konsistensi, deklarasi pengguna, verifikasi keaslian, penilaian
normatif dan keputusan resmi tetap berbeda. Asisten tidak mengesahkan SKK,
tanda tangan atau SBU; tidak menyimpan checklist menjadi tugas otomatis;
tidak mengubah bukti/kasus/assessment; tidak mengirim pengajuan eksternal.
Tidak ada sumber tambahan, draf BG001, MCP atau integrasi Gustafta yang
diaktifkan melalui pilihan tujuan.

Verifikasi perubahan menggunakan respons provider tiruan, HTTP loopback,
PostgreSQL terisolasi dan uji komponen. Tidak diperlukan panggilan AI berbayar.
