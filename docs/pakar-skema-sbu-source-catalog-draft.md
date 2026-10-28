# Katalog draf sumber Pakar Skema SBU

## Status

Disusun 28 Oktober 2026 untuk rancangan chatbot per klasifikasi/subklasifikasi.
Ini inventaris sumber dan kurasi awal pilot BG, **bukan korpus retrieval aktif,
aturan penilaian, autentikasi penerbit, atau konfirmasi keberlakuan hukum**.
Tidak mengubah aplikasi, database, prompt, model, atau deployment.

Metode: membuka seluruh sembilan PDF, mengambil jumlah halaman dan teks sampul,
membandingkan SHA-256 dengan PDF yang sudah ada; membaca bagian BG terarah dan
KBLI 2025 PDF 573–574, serta kelanjutan teks BG009 pada PDF 575.
BG PDF 21 dan KBLI PDF 573 diperiksa visual.
Daftar teks pemetaan dibaca sebagai sampel, belum ditelaah seluruh barisnya.
Nomor PDF di bawah adalah 1-based, bukan nomor cetak.

## Inventaris delapan skema

Sampul menyebut LSBU Konstruksi Indonesia, tahun 2026. Setiap unggahan ini
identik byte dengan tiga salinan terdahulu; bukan versi substansi baru.
Locator daftar kode: PDF 1 masing-masing berkas. Daftar ini bukan bukti bahwa
seluruh persyaratan setiap subklasifikasi telah ditelaah.

| Klasifikasi | Kode pada sampul | Jumlah kode | Halaman PDF | Akhiran berkas unggahan |
| --- | --- | ---: | ---: | --- |
| BG — Bangunan Gedung | BG001–BG009 | 9 | 206 | 1793181978046.pdf |
| BS — Bangunan Sipil | BS001–BS020 | 20 | 218 | 1793181978048.pdf |
| IN — Instalasi | IN001–IN008; IN010–IN014 | 13 | 214 | 1793181978050.pdf |
| KK — Konstruksi Khusus | KK001–KK016 | 16 | 213 | 1793181978050.pdf |
| KP — Konstruksi Prapabrikasi | KP001–KP002 | 2 | 208 | 1793181978051.pdf |
| PA — Penyewaan Peralatan | PA001 | 1 | 206 | 1793181978052.pdf |
| PL — Penyiapan Lahan | PL001–PL008 | 8 | 208 | 1793181978053.pdf |
| PB — Penyelesaian Bangunan | PB001, PB003, PB004, PB005, PB007, PB009, PB010, PB011 | 8 | 208 | 1793181978053.pdf |

Total **77 kode yang tercantum pada sampul**, bukan klaim jumlah seluruh
subklasifikasi nasional. Jangan mengisi celah IN009 atau kode PB yang tidak
tercantum dengan membuat entri sendiri.

Nama lengkap mengikuti pola berkas asli:
`attached_assets/<nomor>._Format_Standar_Skema_Sertifikasi_<kode>_<akhiran>`.

### Sidik berkas

| Sumber | SHA-256 |
| --- | --- |
| BG | d457e9c533e7c2aa1a84cea9bfc3007e5795cc14ad079a80411217d0677cc7d5 |
| BS | 4606ae2833ef52943064dec15de442fd2d92963b7c2dc86f1cf1713c6615e008 |
| IN | 901a4ebfbea9f52741007ec6f9f4cdc5f95e351aeec7adcab62214d1ba711d41 |
| KK | 0e5114c959f739f63a4a7307b5a3f3cbee46afc018e4ed36a7368104c5d56106 |
| KP | 7fb9f6131d294646a64753af5e010daf965c5e6a030879daf1b3093fe8912161 |
| PA | 12803853ebb59a4486224c61583edaffac8ba9034ec1d93e8ea65fd705f66af3 |
| PL | 32fcc67863d492dce2962532705d4bb3d0c65d461bf4047342f6fceefc5b261b |
| PB | cae56c98f532cdab18822190e6459c21a02a54f00103dd94e89a7141923bb9dd |

Deduplikasi harus mempertahankan status telaah/penarikan sumber lama. Unggah
ulang tidak memberi persetujuan retrieval baru atau mengaktifkan kembali sumber
yang dicabut. Lihat `knowledge-intake-sbu-claw.md` untuk penerimaan sebelumnya.

## Dua referensi tambahan

### Buku KBLI 2025

- Berkas: `attached_assets/klasifikasi-baku-lapangan-usaha-indonesia--kbli--2025-_1793182029966.pdf`.
- 1040 halaman PDF.
- SHA-256: `169ec324af12c3e535d081dbe3789e019f9131ab81460357c2453fd0651a56b3`.
- Identitas publikasi BPS pada PDF 4: katalog 1302017, nomor publikasi
  03100.25003. Identitas yang terbaca bukan autentikasi salinan.
- Peran: uraian klasifikasi kegiatan ekonomi, bukan sumber tunggal seluruh
  persyaratan sertifikasi SBU.
- PDF 4 memuat pembatasan reproduksi komersial tanpa izin tertulis BPS.
  Tinjau izin/lisensi sebelum distribusi ulang buku penuh atau reproduksi
  substansial; jangan menyalin seluruh PDF ke direktori publik.

### Daftar teks subklasifikasi–KBLI

- Berkas: `attached_assets/Pasted-Search-Subklasifikasi-KBLI-Deskripsi-KBLI-Ruang-Lingkup_1793182078874.txt`.
- Peran: daftar kandidat pemetaan/pencarian; penerbit, tanggal, dan versi KBLI
  belum teridentifikasi dari sampel yang dibaca.
- Sampel BG001 memakai KBLI 41011 dan judul Konstruksi Gedung Hunian; uraian
  mencakup pembongkaran dan kegiatan real estate. Jangan menganggap isinya
  identik dengan uraian KBLI 2025.
- Header menyebut rangkap TKK, peralatan, dan penyetaraan BK-0404. Keberadaan
  header bukan bukti setiap baris memiliki data atau izin rangkap.

## Katalog awal pilot BG

Skema BG PDF 2: nomor dokumen SSBG.1.LSBU-KI, edisi/revisi 01/11,
tulisan berlaku sejak 21.10.2022 dan tanggal review 21.09.2026.
Tanggal tersebut adalah metadata skema lembaga, bukan tanggal transisi nasional.

Tabel berikut memadankan kode dan judul yang terbaca di skema dengan judul buku
KBLI 2025. Ini pencocokan dokumen terarah, bukan pengesahan penggunaan pada OSS.
Judul diberi awalan **Konstruksi Konvensional** pada seluruh baris.

| Subklasifikasi | KBLI pada skema | Akhiran judul | Locator skema PDF/cetak | Locator buku KBLI PDF/cetak |
| --- | --- | --- | --- | --- |
| BG001 | 41011 | Gedung Hunian | 21 / 7, bagian 2.1.5 | 573 / 557 |
| BG002 | 41012 | Gedung Perkantoran | 21 / 7, bagian 2.1.5 | 573 / 557 |
| BG003 | 41013 | Gedung Industri | 21 / 7, bagian 2.1.5 | 573 / 557 |
| BG004 | 41014 | Gedung Perbelanjaan | 21 / 7, bagian 2.1.5 | 573 / 557 |
| BG005 | 41015 | Gedung Kesehatan | 21 / 7, bagian 2.1.5 | 574 / 558 |
| BG006 | 41016 | Gedung Pendidikan | 22 / 8, bagian 2.1.5 | 574 / 558 |
| BG007 | 41017 | Gedung Penginapan | 22 / 8, bagian 2.1.5 | 574 / 558 |
| BG008 | 41018 | Gedung Hiburan dan Olahraga | 22 / 8, bagian 2.1.5 | 574 / 558 |
| BG009 | 41019 | Gedung Lainnya | 22 / 8, bagian 2.1.5 | 574–575 / 558–559 |

Deskripsi BG009 berlanjut; jangan memotong uraian di batas halaman. Kelanjutan
teks PDF 575 telah dikonfirmasi, tetapi belum disusun dan ditelaah sebagai
kartu jawaban lengkap.

### Contoh kartu kandidat BG001 — belum aktif

- Pertanyaan: Apa ruang lingkup KBLI yang dipasangkan dengan BG001?
- Lingkup: pengertian kegiatan, bukan penetapan kualifikasi atau kelulusan.
- Dasar pemetaan: skema BG PDF 21/cetak 7, 2.1.5, baris BG001–41011.
- Dasar uraian: buku KBLI 2025 PDF 573/cetak 557, kelompok 41011.
- Ringkasan terbatas: pembangunan, pemeliharaan, pembangunan kembali dengan
  metode konvensional untuk hunian, serta perubahan dan renovasi gedung hunian.
- Batas: tidak memindahkan kata pembongkaran dari daftar teks menjadi klaim
  eksplisit buku KBLI 2025; pertanyaan pembongkaran memerlukan penelusuran lanjut.
- Jangan menyimpulkan kegiatan tertentu otomatis mendapat SBU atau memenuhi
  bukti pengalaman hanya dari kesamaan uraian kegiatan.

## Peta telaah lanjutan pilot

| Topik | Locator awal skema BG | Status |
| --- | --- | --- |
| Identitas, kode dan ruang lingkup | PDF 21–22, 2.1.5; KBLI PDF 573–575 | Pencocokan awal; uraian lengkap perlu dilengkapi |
| Penjualan dan kemampuan keuangan | PDF 23, 3.1–3.2 | Ada telaah BG001 terdahulu; bukan ambang aktif baru |
| Personel/SKK | PDF 24–25, 3.3 | Butuh pemisahan baris subklasifikasi dan jenis BUJK |
| Peralatan | PDF 26–27, 3.4 | Tabel berlanjut; jangan menghilangkan baris M/B |
| Pengalaman dan perpanjangan | PDF 37–38, 5.1.2 | Gap pengalaman terdahulu tetap terbuka |
| Kriteria lain | PDF 23 sebelum 3.1 | Telaah detail SMAP, asosiasi, BO, LKUT, PUB terpisah |

Rujuk telaah yang sudah ada, bukan menimpa kesimpulannya:
`bg001-institutional-scheme-comparison-draft.md`,
`bg001-k2-financial-source-clarification-draft.md`,
dan `bg001-bujkn-requirements-draft.md`.

Catatan skema PDF 22 mengutip surat edaran bersama mengenai KBLI 2020/2025.
Surat edaran aslinya belum diperiksa dalam pekerjaan ini; chatbot tidak boleh
mengubah kutipan sekunder itu menjadi konfirmasi langsung aturan transisi.

## Kontrak kurasi sebelum chatbot diaktifkan

Setiap kartu kandidat harus memiliki: identitas dan hash sumber, halaman PDF
dan nomor cetak/bagian, teks atau ringkasan terarah, klasifikasi/subklasifikasi,
jenis BUJK dan kualifikasi bila relevan, batas interpretasi, status telaah,
serta keputusan persetujuan retrieval yang terpisah dari verifikasi hukum.

Antarmuka perlu membedakan:

1. **Terinventarisasi** — identitas/kode diketahui.
2. **Kandidat ditelaah** — tersedia ringkasan dan locator yang diperiksa.
3. **Disetujui untuk jawaban** — lolos keputusan kurasi dan implementasi.

Tidak satu pun tahap itu otomatis mengaktifkan aturan asesmen BG001.
Tidak ada pengiriman isi lampiran ke AI berbayar pada tahap katalog ini.

## Perkembangan implementasi pilot

Setelah tahap inventaris, dibuat pilot opsional BG001–BG009 di Asisten Peran.
Hanya ringkasan pemetaan dan ruang lingkup pada katalog ini yang dikurasi menjadi
kartu runtime; ini bukan aktivasi seluruh dokumen atau matriks persyaratan.
Kelanjutan BG009 pada KBLI PDF 575 dicakup dalam ringkasan ruang lingkup.

Kartu diberi status unverified dan identitas versi tersendiri. Keputusan
penarikan pada ledger sumber tetap berlaku dan diperiksa lagi setelah generasi;
jika salah satu sumber pemetaan/uraian tidak tersedia, pengiriman pilot ditolak.
Kartu tidak ikut retrieval umum tanpa pilihan skema. Tidak ada impor file
privat atau distribusi ulang buku KBLI lengkap.

Tautan pada kartu adalah kanal rujukan, bukan pembaca PDF. Khusus skema LSBU,
kanal Bina Konstruksi adalah kanal pembina, bukan bukti penerbit/autentikasi
skema institusional. Pembaca sumber lengkap belum ditambahkan pada pilot ini.

Pilot selanjutnya mencakup BS001–BS020 dengan batas yang sama.
Pemetaan, locator lintas halaman dan pengecualian ruang lingkupnya dijelaskan
dalam [catatan pilot Bangunan Sipil](pakar-skema-bs-pilot.md). Klasifikasi lain
tetap inventaris, belum menjadi sumber pilot aktif.
