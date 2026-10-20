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
