# Salin sumber jawaban di browser

Jalankan `pnpm --filter @workspace/gustafta-sbu test:chat`.
Memerlukan Chromium di `/repl/tools/bin/chromium` atau `CHAT_CHROMIUM_PATH`.
Chromium yang tidak tersedia menggagalkan uji, bukan melewatinya.

Fixture memuat `SbuChatPage`, `AccountQueries`, kartu sumber, dan klien API
asli tanpa router aplikasi atau Clerk. Semua API dicegat dengan data sintetis;
permintaan lain ditolak dan menggagalkan uji. Tidak ada akun yang dibuat,
dokumen yang dikirim, akses database, atau panggilan AI.

Satu alur mengirim pertanyaan, memeriksa dua kartu (verified terbatas dan
unverified), mengeklik **Salin jawaban**, lalu membaca clipboard native
Chromium. Ekspektasi independen memeriksa dokumen, versi, locator, status,
ringkasan, cakupan, batas verifikasi, tanggal, URL dan pemberitahuan retrieval.
Setelah konfirmasi percakapan baru, alur memeriksa jawaban tanpa sumber,
pemberitahuan kosong, payload tanpa riwayat lama, serta UI dan clipboard
tanpa sumber percakapan sebelumnya.

Bundle sementara, browser dan server dibersihkan dalam `finally`.
Uji ini tidak membuktikan layanan AI/pencarian, autentikasi, atau izin clipboard
Firefox/Safari; izin clipboard Chromium diberikan secara eksplisit.

## Freshness kuota

`quota-freshness.test.mjs` ikut dijalankan oleh `test:chat` dan `test`.
Empat skenario memakai komponen `SbuChatPage`, `ChatQuotaNotice`,
`AccountQueries`, TanStack Query, dan klien HTTP asli:

- Dua page dalam satu konteks browser, akun sama tetapi cache terpisah:
  kirim dari tab pertama, baca perubahan di tab kedua setelah polling 15 detik
  dan secara terpisah saat kembali aktif tanpa memajukan timer polling.
- Jam melewati 07.00 WIB tanpa menjalankan timer selama tidur: kembali aktif
  membaca sisa kuota serta tanggal reset hari berikutnya, mempertahankan draf.
- Pergantian identitas memakai boundary berkunci seperti aplikasi: respons A
  tertahan ketika beralih ke B, tidak ada kuota A selama B dimuat maupun pada
  rekaman perubahan DOM. Kembali ke A juga harus membaca ulang.
- GET kuota 503 setelah sukses: angka cache disembunyikan, tombol kirim dan
  Enter tidak dapat mengirim. **Periksa lagi** memulihkan kuota dan pengiriman
  tanpa membuang draf atau persetujuan.

Playwright Clock mengontrol waktu. Headless Chromium melaporkan kedua page
tetap terlihat; fixture menyimulasikan `visibilityState`/`visibilitychange`
untuk melewati listener fokus asli TanStack, bukan memanggil refetch langsung.
Ini regresi integrasi browser deterministik, bukan bukti suspend native,
BFCache, pergantian sesi Clerk nyata, atau perhitungan kuota backend.
Server sintetis mengontrol kuota untuk kedua akun dan seluruh API dicegat;
jalur jaringan yang tidak dikenal menggagalkan uji. Chromium wajib tersedia.
