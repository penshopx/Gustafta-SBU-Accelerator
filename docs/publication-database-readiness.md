# Kesiapan database sebelum publikasi

## Jalur yang dipertahankan

- Development/post-merge: skema dan skrip SQL development diproses oleh alur proyek yang sudah ada.
- Produksi: build menghasilkan bundle, lalu startup menjalankan bundle API langsung.
- Untuk PostgreSQL terkelola Replit, Publish membandingkan skema development dan produksi, meminta konfirmasi perubahan yang relevan, lalu menerapkan perbedaannya.
- Tidak menambahkan DDL, `drizzle-kit push`, atau skrip migrasi ke build/startup produksi.
- Jangan memakai opsi penimpaan data produksi dengan data development sebagai cara mengatasi kesiapan skema.

Tidak dipanggilnya skrip `migrate:workspace` oleh startup produksi bukan, dengan sendirinya, cacat konfigurasi. Pernyataan audit sebelumnya yang menganggapnya sebagai penghalang telah dikoreksi.

## Temuan pemeriksaan read-only

Pada pemeriksaan ini, metadata database terkelola menunjukkan:

| Tabel di skema public | Development | Produksi |
| --- | --- | --- |
| ai_budget_lock | Ada | Tidak terlihat |
| ai_budget_counters | Ada | Tidak terlihat |
| ai_budget_model_policies | Ada | Tidak terlihat |

Pemeriksaan hanya membaca `information_schema.tables` pada kedua lingkungan. Tidak membaca profil, permohonan, dokumen, kredensial, atau isi percakapan. Temuan ini adalah snapshot pemeriksaan, bukan bukti hasil publikasi berikutnya, dan tidak menggantikan pemeriksaan koneksi jika produksi kelak memakai database eksternal.

## Skema berbeda dari inisialisasi data

Skrip SQL development anggaran tidak hanya membuat tabel: skrip juga memasukkan baris pengunci permanen `ai_budget_lock` dengan `id=1`. Pembaca status dan reservasi biaya mengharuskan baris ini tersedia; jika tidak, layanan anggaran menolak secara aman.

Penerapan diff skema tidak boleh dianggap sebagai bukti bahwa INSERT, seed, atau backfill data ikut dijalankan. Jangan menyalin penghitung biaya development ke produksi, mengosongkan penghitung produksi, atau menghilangkan pengunci bersama demi membuka pengiriman.

Sebelum AI produksi diaktifkan, kebutuhan inisialisasi baris pengunci perlu diselesaikan melalui rancangan inisialisasi data yang terpisah dan ditelaah. Dokumen ini tidak menambahkan mekanisme tersebut dan tidak menjalankan perubahan database.

## Gerbang publikasi/aktivasi

1. Tinjau diff skema yang ditampilkan Publish. Jika ada penghapusan, rename, atau perubahan berisiko, jangan menyetujuinya tanpa telaah.
2. Setelah publikasi yang disetujui pengguna, verifikasi keberadaan tabel anggaran secara read-only.
3. Pastikan prasyarat pengunci anggaran terpenuhi melalui mekanisme yang disetujui, tanpa DDL runtime dan tanpa mereset riwayat biaya.
4. Sediakan profil tarif model produksi yang telah diverifikasi. Ketersediaan API key saja tidak mengaktifkan model.
5. Verifikasi login dan pembacaan status anggaran dengan akun uji yang disetujui; pengujian ini tidak memerlukan panggilan AI berbayar.
6. Sampai prasyarat selesai, pertahankan penolakan aman AI. Jangan menyatakan AI siap operasional hanya karena health endpoint berhasil.

Tidak ada publikasi, DDL/DML produksi, perubahan kasus lama, pemanggilan AI, atau aktivasi integrasi eksternal yang dilakukan dalam pemeriksaan ini.

## Referensi platform

- https://docs.replit.com/cloud-services/storage-and-databases/production-databases
- Jalur ini berlaku untuk database PostgreSQL terkelola Replit, bukan database eksternal.
