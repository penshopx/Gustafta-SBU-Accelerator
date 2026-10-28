# Kurasi TERAS LPJK Episode 12

Tanggal kurasi: **28 Oktober 2026**. Permintaan pengguna: menambahkan tiga
PDF sebagai knowledge base aplikasi.

## Hasil yang dipakai aplikasi

Tiga sumber baru, masing-masing tiga cuplikan terkurasi, ditambahkan ke
katalog Asisten dan Pusat Pengetahuan. Materi 1–2 diklasifikasikan sebagai
**panduan/paparan**, materi 3 sebagai **praktik/perspektif pelaku usaha**.
Semuanya **belum terverifikasi**; bukan sumber primer, keputusan telaah
hukum, atau konfirmasi status terkini.

Teks seluruh halaman diekstrak; bagian yang diringkas ditelaah untuk kurasi. Sampul ketiga PDF
serta diagram timeline materi 2 dan slide SMAP materi 3 diperiksa visual.
Tabel dan angka rinci tidak dijadikan persyaratan penilaian. Ini bukan
indeks seluruh teks PDF, autentikasi dokumen, atau unggahan dokumen ke AI.
PDF asli diarsipkan di App Storage privat pada namespace khusus sumber
terkurasi, bukan bundle aplikasi, database, atau namespace dokumen pengguna.
URL penerbit pada kartu tetap kanal LPJK, **bukan** tautan unduh PDF.
Tombol PDF terpisah memakai endpoint sesi/pemilik untuk salinan unggahan.
Nama dan hash di bawah mengikat locator ke salinan yang benar-benar dibaca.

## Identitas salinan

| Materi | Berkas asli di `attached_assets/` | Halaman PDF | SHA-256 |
| --- | --- | ---: | --- |
| Peraturan Konversi SBU — Sigit Anjar; sampul 9 September 2026 | `TERAS_LPJK_#12_Materi_1_-_Ketentuan_dan_Usulan_Konversi_SBU_Pa_1793168014141.pdf` | 20 | `951717a952b90a13111f4b61a6e3362eb613741ba63a44921357e1cf52a250f2` |
| Kesiapan Sistem Informasi — Hambali; sampul hanya tahun 2026 | `TERAS_LPJK_#12_Materi_2_-_Kesiapan_Sistem_utk_Kepdirjen_281_RE_1793168014140.pdf` | 9 | `8312cddc75f75a66ebf3cf51901e46a4b191fbfd3ef61732cf8af874f0edc7f0` |
| Perspektif Pelaku Usaha — Ruslan Rivai; sampul 9 September 2026 | `TERAS_LPJK_#12_Materi_3_-_Perspektif_Pelaku_Usaha_Pak_Ruslan_1793168014142.pdf` | 9 | `aa7beda839fa63fc804db96e436741b950e9af881f9627b8e3025e5f05610119` |

## Locator dan batas substansi

- **Materi 1, PDF 5–7:** transisi dan penggunaan SBU existing. Tidak
  menggantikan surat pemberlakuan Pasal 20 ayat (2).
- **Materi 1, PDF 8–9:** judul eksplisit *Usulan Mekanisme Konversi*;
  tanpa biaya dan otomatis tidak boleh dinyatakan sebagai layanan aktif.
- **Materi 1, PDF 11–19:** kelompok bahan persiapan; bukti SMAP pada PDF
  16. Tidak mengaktifkan nominal, rasio, batas pengalaman dua periode,
  tenggat komitmen, atau draf BG001 sebagai aturan penilaian.
- **Materi 2, PDF 3–4:** ekosistem sistem, dasar hukum dan perbedaan pemicu.
- **Materi 2, PDF 5–7:** rencana pengembangan, pengujian, infrastruktur dan
  prasyarat. Tidak membuktikan UAT, keamanan atau kesiapan telah tercapai.
- **Materi 2, PDF 8:** diagram berjudul *Tahapan Implementasi Sesuai Usulan
  Timeline*. Tanggal pada diagram bukan pemicu resmi; tidak digunakan untuk
  hitung mundur atau mengubah gerbang verifikasi transisi.
- **Materi 3, PDF 3–4:** membedakan jalur konversi dan sertifikasi;
  statistik secara eksplisit berupa proyeksi berbasis asumsi jadwal.
- **Materi 3, PDF 6–7:** aspek persiapan, LKUT, PUB, serta perbedaan uraian
  SMAP. PDF 6 bertuliskan slide **07/10**, PDF 7 bertuliskan **08/10**.
  Penomoran cetak melompati 06/10; jangan menganggap salinan ini 10 halaman
  atau mengarang isi halaman yang tidak ada.
- **Materi 3, PDF 5, 8–9:** tata kelola, perlindungan BUJK patuh,
  pendampingan dan masukan. Pendapat pembicara bukan temuan audit.

### Konflik SMAP yang belum diselesaikan

Materi 1 PDF 16 membahas sertifikat, Pancek, dan komitmen; materi 3 PDF 6
memuat frasa “Tanpa opsi dokumen dibuat BUJK”. Korpus mempertahankan
perbedaan ini secara eksplisit. Jangan meniadakan alternatif bukti dalam
ringkasan Permen/Kepdirjen yang ada atau menyimpulkan penerapan pada suatu
BUJK tanpa telaah sumber primer dan ahli.

## Versi dan operasional

Identitas awal: `teras12-konversi-20261028-r1`,
`teras12-sistem-20261028-r1`, `teras12-pelaku-20261028-r1`.
Baseline berarti penerimaan editorial ringkasan baru berdasarkan permintaan
pengguna, **bukan** keputusan verifikasi hukum. Ledger penarikan/penggantian
sumber yang sama tetap berlaku. Jangan mengubah snapshot versi ini di tempat
setelah rilis; penggantian memakai identitas baru dan alur telaah yang ada.

Pencarian lokal tidak memanggil AI atau layanan luar. Hanya cuplikan yang
relevan dapat masuk konteks Asisten sesuai alur persetujuan chat yang sudah
ada. Tidak ada dokumen privat, profil, data kasus atau kredensial yang
ditambahkan ke korpus, dan tidak ada integrasi Gustafta/OSS/SIMPAN baru.

## Pembaca arsip privat

`knowledge-pdf-manifest.ts` mengikat sumber/versi dan ID kutipan ke SHA-256,
jumlah halaman, serta halaman PDF awal; nomor slide tidak dipakai sebagai
indeks halaman. Sembilan kutipan memiliki target halaman pada tiga PDF.
Versi baru tidak otomatis mewarisi PDF versi lama.

Operator menjalankan `scripts/publish-knowledge-pdfs.ts` dengan root workspace.
Skrip memeriksa hash, format/struktur dan jumlah halaman, kemudian melakukan
create-only di `curated-knowledge/<sha256>.pdf` di bawah private dir yang sudah
ada, dengan metadata ACL privat untuk pemilik sistem. Tidak melist objek
pelanggan, mengubah ACL bucket, atau membuat tautan publik. Pemeriksaan
format/hash bukan pemindaian antivirus atau autentikasi penerbit.

GET `/api/knowledge-sources/:citationId/pdf` memerlukan sesi dan pemilik
formulir yang sesuai. Ledger diperiksa sebelum dan sesudah pembacaan berkas;
ketidaktersediaan ledger/arsip, hash berbeda, sumber dicabut atau versi
tak dikenal tidak boleh mengirim PDF parsial. Pembacaan dibatasi ukuran,
waktu, dan dibatalkan saat koneksi klien ditutup. Konten dikirim no-store,
bukan redirect atau URL bertanda tangan.

Pembaca membuat blob setelah klik pengguna dan merender halaman melalui
PDF.js beserta worker yang dibundel lokal, bukan CDN atau plugin PDF browser.
Library dan worker memakai pasangan legacy agar browser yang belum memiliki
API JavaScript terkini tetap dapat merender.
Navigasi sebelumnya/berikutnya memakai halaman PDF, bukan nomor slide.
URL dilepas saat diganti,
dialog/sumber ditutup, atau akun berganti; respons terlambat tidak boleh
membuka berkas lama. Buka tab baru tetap menggunakan fragmen `#page=`
sebagai petunjuk pembaca PDF bawaan; dukungan dapat berbeda.
Disediakan tautan unduh bila pratinjau tidak didukung.
Pemeriksaan status latar sementara menyembunyikan pembaca dan menonaktifkan
interaksinya tanpa membuang halaman yang sudah dibuka. Jika sumber tetap
aktif, pembaca yang sama kembali terlihat. Penarikan, kegagalan pemeriksaan,
penutupan eksplisit dan pergantian akun tetap melepas pembaca/URL.
Berkas yang telah diterima/diunduh
tidak dapat ditarik dari perangkat; penarikan sumber mencegah akses berikutnya.
