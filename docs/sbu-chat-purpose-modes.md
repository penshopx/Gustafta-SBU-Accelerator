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

Mode Pemeriksa Dokumen **tidak membaca unggahan secara otomatis** dan tidak
menambahkan akses berkas. Pengguna dapat menulis cuplikan anonim yang
diperlukan, atau menggunakan alur Bedah Dokumen terpisah dengan pemilihan
halaman/persetujuannya. Ini bukan aktivasi koneksi hasil Bedah Dokumen ke chat.

Kelengkapan/konsistensi, deklarasi pengguna, verifikasi keaslian, penilaian
normatif dan keputusan resmi tetap berbeda. Asisten tidak mengesahkan SKK,
tanda tangan atau SBU; tidak menyimpan checklist menjadi tugas otomatis;
tidak mengubah bukti/kasus/assessment; tidak mengirim pengajuan eksternal.
Tidak ada sumber tambahan, draf BG001, MCP atau integrasi Gustafta yang
diaktifkan melalui pilihan tujuan.

Verifikasi perubahan menggunakan respons provider tiruan, HTTP loopback,
PostgreSQL terisolasi dan uji komponen. Tidak diperlukan panggilan AI berbayar.
