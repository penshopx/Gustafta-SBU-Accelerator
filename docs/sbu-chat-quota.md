# Kebijakan kuota Asisten peran SBU

Kebijakan ini hanya berlaku pada Asisten peran (`/openai/sbu/messages`), bukan
Klinik Konsultasi atau Bedah Dokumen. Tidak mengubah paket pembayaran, profil,
atau akun pengguna.

- Identitas kuota berasal dari sesi server Clerk, bukan body, peran, IP, atau
  header pemilik formulir. Header pemilik tetap diperiksa sebagai prasyarat.
- Satu permintaan aktif per akun lintas instance. Reservasi memiliki lease 120
  detik untuk pemulihan bila instance mati; deadline permintaan 70 detik.
  Bila adapter belum mengakhiri panggilan saat pembatalan, lease dipertahankan
  hingga kedaluwarsa (maksimal 120 detik sejak reservasi).
- Enam percobaan per menit kalender UTC (bukan jendela bergulir).
- Bawaan 30 percobaan per hari UTC, reset 00.00 UTC / 07.00 WIB.
  `SBU_CHAT_DAILY_LIMIT` adalah integer 1–1000, bawaan 30. Semua instance harus
  memakai nilai yang sama; nilai tidak sah menghentikan startup.
- Reservasi atomik di PostgreSQL menghitung satu percobaan sebelum pemanggilan
  provider. Kegagalan, jawaban/kutipan tidak valid, timeout, dan pembatalan setelah
  reservasi tidak mengembalikan kuota: provider mungkin sudah menimbulkan biaya.
  Retry manual adalah percobaan baru. Retry otomatis SDK dimatikan untuk Asisten
  peran; tidak ada retry otomatis klien. Validasi/consent/owner gagal, penolakan
  kuota, dan kegagalan database sebelum reservasi tidak memanggil provider.
- Batas payload tetap 20 pesan / 40.000 karakter, pesan pengguna 4.000 karakter;
  keluaran maksimal 8.192 token. Ini batas percobaan dan ukuran, bukan estimasi
  rupiah atau jaminan batas tagihan global. Akun berbeda memiliki kuota terpisah.
- Database tidak tersedia: fail closed (503), tanpa fallback kuota memori.
- Satu baris penggunaan per identitas: penghitung periode dan token/waktu lease
  sementara. Tidak ada isi chat, respons AI, nama perusahaan, dokumen, kredensial,
  atau error provider yang disimpan. Baris yang sama ditimpa saat periode berubah,
  tanpa riwayat percakapan/penggunaan harian tak terbatas.
- GET kuota dan respons pengiriman bersifat private/no-store. Sisa kuota adalah
  snapshot yang disegarkan saat masuk, fokus, berkala, dan sesudah pengiriman;
  database selalu menjadi sumber keputusan, termasuk antar-tab/instance.

Migrasi aditif `chat-quota.sql` berjalan pada startup API melalui migrasi
workspace yang sudah ada. Tidak memerlukan pembuatan/perubahan profil pengguna.
