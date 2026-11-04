# Pemeriksaan sumber resmi Permen PUPR 7/2024

Tanggal pemeriksaan: **4 November 2026**.

## Kesimpulan

**Terbukti sebagian; autentikasi berkas masih terhalang.** Metadata JDIH BPK
mencantumkan status Berlaku. Teks dari URL PDF BPK mendukung pokok enam
ringkasan terkurasi. Ini tidak membuktikan bahwa byte salinan unggahan sama
dengan byte PDF penerbit, validitas tanda tangan, atau kelengkapan penelusuran
perubahan hukum hingga tanggal pemeriksaan.

Status aplikasi tetap `unverified`. Tidak ada promosi versi, perubahan kutipan
historis, keputusan ledger penelaah, aktivasi tenggat, grade atau skor otomatis.

## Sumber dan hasil akses

| Sumber | Hasil aktual | Batas bukti |
|---|---|---|
| [JDIH PU, halaman dokumen](https://jdih.pu.go.id/detail-dokumen/PermenPUPR-nomor-7-tahun-2024-Pengembangan-Usaha-Berkelanjutan) | Hasil pencarian mengidentifikasi judul/nomor yang sesuai; pembacaan halaman gagal dan koneksi HTTP langsung timeout setelah 50 detik | Cuplikan pencarian bukan konfirmasi isi lengkap atau status penerbit |
| [JDIH BPK, metadata](https://peraturan.bpk.go.id/Details/291479/permen-pupr-no-7-tahun-2024) | Isi halaman terbaca: ditetapkan 19 Juni 2024, diundangkan/berlaku 5 Juli 2024, BN 2024 (371), 169 halaman, metadata Status: Berlaku | Bagian terpisah STATUS PERATURAN menyebut Belum Tersedia; tidak membuktikan tidak ada perubahan/pencabutan |
| [JDIH BPK, tautan PDF](https://peraturan.bpk.go.id/Download/350771/permen-pupr-no-7-tahun-2024.pdf) | Pembaca web menghasilkan ekstraksi teks, termasuk pasal 1–20 dan awal lampiran. Unduhan byte langsung menghasilkan HTTP 403, HTML tantangan Cloudflare 5.582 byte, bukan PDF | Ekstraksi mendukung isi teks, bukan hash atau jumlah halaman fisik PDF resmi |

Penelusuran memakai judul lengkap, nomor, serta kata perubahan/pencabutan dan
domain resmi. Tidak ditemukan bukti perubahan/pencabutan dalam hasil yang
berhasil dibaca; **hasil negatif pencarian bukan bukti hukum ketiadaan perubahan**.
Tidak memakai salinan pihak ketiga sebagai pengganti bukti penerbit.

## Perbandingan terhadap ringkasan yang aktif

Perbandingan berikut bersifat tekstual terhadap ekstraksi URL PDF BPK.
Locator halaman adalah locator **salinan unggahan**, bukan hasil pemeriksaan
ulang tata letak PDF resmi. Tidak menyatakan dua berkas identik.

| Ringkasan / locator salinan | Isi yang dicocokkan dengan teks BPK | Hasil |
|---|---|---|
| PUB, Pasal 2–4, PDF 3 | Pembinaan oleh asosiasi; PUB umum seluruh anggota; PUB khusus seluruh BUJK kecil dan pemetaan kinerja menengah/besar/spesialis | Pokok ringkasan sesuai |
| PUB umum, Pasal 6–7, PDF 4–5 | Minimal sekali setahun; tahapan persiapan/pelaksanaan/pelaporan/evaluasi; unsur laporan dan maksimal 14 hari kerja setelah kegiatan | Pokok ringkasan sesuai; pelapor adalah penyelenggara kegiatan, bukan tenggat LKUT |
| PUB khusus, Pasal 8–9, 11–13, PDF 5–7 | Bentuk pembelajaran; frekuensi BUJK kecil; prioritas grade B/C/D; evaluasi sebelum/sesudah | Pokok ringkasan sesuai; grade bukan kualifikasi SBU |
| LKUT, Pasal 10(1)–(4), PDF 5 | Pengisian kinerja menengah/besar/spesialis bagian LKUT; 30 April tahun berikutnya; SIJK dan rujukan lampiran | Pokok ringkasan sesuai; bukan klaim kewajiban LKUT hanya kelompok tersebut |
| Tanggung jawab, Pasal 17, PDF 9 | LKUT, pengisian kinerja kelompok terkait, PUB sesuai prioritas dan kewajiban anggota | Pokok ringkasan sesuai; tetap berbeda dari laporan kegiatan asosiasi |
| Format LKUT, Lampiran A angka 1–2, PDF 11–12 dan 14 | Kepemilikan SBU, penggantian TKK, peralatan, SMAP, pengalaman/serah terima; data keuangan dan manajemen | Pokok cuplikan sesuai; bukan validasi seluruh lampiran |

Teks Pasal 19 menyebut pencabutan **ketentuan penilaian kinerja dan LKUT dalam
lampiran Permen PUPR 6/2021**, bukan pencabutan seluruh Permen 6/2021.
Catatan ini tidak mengubah aturan aplikasi atau memperluas kutipan secara diam-diam.

## Identitas salinan dan bagian yang belum terbukti

- Hash SHA-256 salinan unggahan:
  `d2af3e4ac7b8f1b5b503ae88d4a1afb8aee76ba80989d4719dd7af3b765cd228`.
- Salinan unggahan: 2.198.993 byte; 169 halaman berdasarkan intake sebelumnya.
- Hash byte PDF resmi: **belum diperoleh**. Respons HTML 403 tidak dihitung
  sebagai hash dokumen hukum.
- Jumlah halaman fisik dan tata letak PDF resmi: **belum dibandingkan**;
  angka 169 pada BPK adalah metadata yang sesuai dengan salinan.
- Tanggal pada ekstraksi halaman pengundangan rusak; tanggal 5 Juli 2024
  didukung metadata BPK, bukan direkonstruksi dari karakter ekstraksi yang rusak.
- Autentikasi tanda tangan/QR dan status lengkap pada penerbit: **belum terbukti**.

## Syarat penutupan penuh

1. Peroleh byte PDF dari tautan resmi yang dapat diakses tanpa melewati
   pembatasan layanan; catat URL akhir, waktu akses, hash dan jumlah halaman.
2. Bandingkan dengan salinan unggahan. Bila hash berbeda, bandingkan teks dan
   render halaman enam locator; jangan menyimpulkan perbedaan substansi hanya
   dari hash atau menganggap teks sama membuktikan byte sama.
3. Periksa status dan hubungan peraturan pada penerbit; bila tidak tersedia,
   nyatakan batasnya atau minta konfirmasi instansi.
4. Bila bukti memerlukan perubahan substansi/metadata aplikasi, buat snapshot
   baru melalui pola versi yang berlaku, pertahankan versi historis, penarikan
   sumber dan pemeriksaan regresi. Jangan menaikkan status hanya karena retrieval
   disetujui.

Pekerjaan pada putaran ini hanya penelitian sumber publik dan dokumentasi.
Tidak ada akses data pelanggan, akun uji, perubahan database, panggilan AI aplikasi
berbayar atau publikasi.
