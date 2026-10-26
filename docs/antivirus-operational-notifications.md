# Pengiriman peringatan antivirus ke pengelola

## Tujuan yang disetujui

Pengelola mengganti pilihan awal Putlog menjadi **Slack**, lalu memilih kanal
**#all-sbu**. Putlog tidak digunakan. Aplikasi memakai koneksi Slack yang
diotorisasi lewat integrasi Replit, bukan token manual atau webhook.

Konfigurasi non-rahasia melalui environment:

- `DOCUMENT_SIGNATURE_ALERT_PROVIDER=slack`
- `DOCUMENT_SIGNATURE_SLACK_CHANNEL`: ID kanal #all-sbu yang telah dipilih.
- `DOCUMENT_SIGNATURE_SLACK_CONNECTION_ID`: ID koneksi Slack yang diotorisasi.

Koneksi dipin berdasarkan ID agar penambahan koneksi Slack lain tidak mengubah
tujuan diam-diam. SDK Replit menangani autentikasi dan pembaruan token.
Jangan menyalin credential ke chat, Git, atau environment buatan sendiri.
Mengganti kanal memerlukan keputusan pengelola, verifikasi akses koneksi, dan
memulai ulang API setelah mengubah konfigurasi.

## Event dan privasi

`scan_signature_alert` mengirim peringatan berlabel Gustafta–Antivirus dengan
`severity=warning/critical`; `scan_signature_recovered` mengirim pemulihan
`severity=info`. Pesan memuat event, severity, reason, usia signature, sisa jam
sebelum kedaluwarsa, jumlah kegagalan berurutan dan instruksi operasional tetap.

Field diizinkan satu per satu; teks instruksi dibuat ulang dari konstanta.
Tidak ada identitas pengguna aplikasi, nama/isi/jalur dokumen, credential,
output proses atau pesan exception dalam pesan maupun diagnostik pengiriman.
ID kanal hanya dipakai sebagai alamat tujuan, ID koneksi hanya untuk routing
integrasi. Slack tetap dapat menampilkan identitas akun integrasi sebagai
pengirim sesuai izin OAuth; identitas tersebut tidak ditambahkan ke payload.
Pesan dikirim tanpa format mention, parsing tambahan atau pratinjau tautan.

Keberhasilan memerlukan HTTP 2xx **dan** `ok=true`, ID kanal yang sesuai serta
timestamp pesan pada respons Slack. HTTP 200 dengan `ok=false` tetap gagal.
Respons Slack/SDK tidak diteruskan ke log. Penerimaan di kanal tidak menjamin
semua anggota menyalakan notifikasi atau telah membaca pesan.

## Kegagalan dan batas jaminan

Pengiriman berlangsung asinkron, terpisah dari updater/pemindaian. Timeout
5 detik per percobaan; maksimal tiga percobaan dengan jeda 5 dan 30 detik.
Signal pembatalan diteruskan ke proxy SDK dan redirect ditolak. Kegagalan
SDK/autentikasi/jaringan/Slack tetap di dalam batas pengiriman; tidak mengubah
hasil atau keputusan pemindaian. Inisialisasi koneksi dilakukan saat pengiriman,
bukan sebagai prasyarat startup pemindai.

Urutan FIFO menjaga peringatan sebelum pemulihan selama pengulangan.
Antrean dibatasi 16 event per proses (termasuk yang sedang dikirim). Antrean
penuh menolak event baru dan mencatat `scan_signature_delivery_overflow`.
Setelah tiga kegagalan event dilepas dengan
`scan_signature_delivery_exhausted`; log signature asli tetap ada.
`scan_signature_delivery_failed` menandai gangguan kanal dan
`scan_signature_delivery_recovered` menandai pengiriman berikutnya berhasil,
**bukan** bukti kesehatan antivirus. Pantau diagnostik ini dari log API secara
independen; Slack yang sedang gagal tidak dapat memberitahukan kegagalannya sendiri.

Konfigurasi salah dicatat `scan_signature_delivery_invalid_config`, tanpa
mencoba tujuan lain. Bila integrasi dicabut atau hak kirim berubah, perbaiki
koneksi/keanggotaan kanal melalui integrasi Replit; tidak perlu mematikan scan.

Pembatasan peringatan dan pemulihan menggunakan satu baris operasional PostgreSQL
(`antivirus_signature_incidents`, kunci tetap `antivirus-signatures`) bersama
untuk Slack maupun HTTPS. Transaksi dengan penguncian baris mencegah dua instance
mengklaim notifikasi yang sama. Status bertahan setelah restart: peringatan dan
pemulihan masing-masing dibatasi 24 jam, sedangkan eskalasi warning ke critical
langsung diizinkan. Waktu berasal dari database untuk menghindari perbedaan jam
antar-instance. Hanya status insiden, tingkat keparahan terakhir, waktu notifikasi,
dan jumlah kegagalan disimpan; tidak ada data dokumen/pengguna atau payload pesan.
Semua instance satu aplikasi/lingkungan harus memakai database yang sama.

Migrasi dijalankan otomatis sebelum API mulai. Jika penyimpanan status gagal,
`scan_signature_state_failed` dicatat sekali per gangguan lokal; percobaan berikutnya
mengulang dan mencatat `scan_signature_state_recovered` saat pulih. Notifikasi kanal
tidak memakai pembatasan lokal sebagai cadangan karena akan membuka duplikasi.
Kegagalan ini tidak mengubah keputusan pemindaian; pantau log status secara independen.

Antrean dan pengulangan pengiriman masih lokal per proses. Status pembatasan
disimpan sebelum enqueue; restart/shutdown pada jeda tersebut atau sebelum antrean
terkirim dapat kehilangan notifikasi sampai pengingat berikutnya. Ini bukan outbox
tahan restart. Restart/shutdown membuang antrean.
Timeout bisa terjadi setelah Slack menerima pesan sehingga retry juga dapat
menghasilkan duplikat. Tidak ada jaminan exactly-once atau pengiriman tahan restart.

Regresi deduplikasi bersama (menggunakan skema dan akun database uji terisolasi,
tidak mengubah tabel aplikasi):

```sh
pnpm --filter @workspace/api-server exec node --test test/document-signatures.test.mjs test/document-signature-state-postgres.test.mjs test/document-signature-delivery.test.mjs
```

## Pemeriksaan

Regresi offline, tanpa mengirim ke Slack:

```sh
pnpm --filter @workspace/api-server exec node --test test/document-signatures.test.mjs test/document-signature-delivery.test.mjs
pnpm --filter @workspace/api-server typecheck
```

Cakupan: sanitasi, konfigurasi invalid, HTTP/SDK gagal, kegagalan logis Slack pada
HTTP 200, kanal respons berbeda, pembatalan, timeout, pemulihan, urutan event,
batas antrean, shutdown, pin koneksi, dan updater tetap berjalan saat kanal macet.

Uji sambungan langsung (hanya dengan persetujuan pengelola; mengirim **dua pesan**
ke kanal yang dikonfigurasi):

```sh
pnpm --filter @workspace/api-server test:signature-slack-live
```

Kedua pesan diberi label **UJI SAMBUNGAN — BUKAN INSIDEN NYATA**. Pesan pertama
mensimulasikan peringatan dan pesan kedua pemulihan; tidak ada signature atau
hasil pemindaian yang diubah. Perintah gagal jika Slack tidak mengakui salah
satu pesan. Pengujian ini tidak masuk suite otomatis agar tidak membanjiri kanal.

Verifikasi sambungan awal pada 26 Oktober 2026: kedua pesan uji diakui oleh
Slack dan keberadaan peringatan serta pemulihan dikonfirmasi kembali melalui
riwayat #all-sbu. Regresi offline: 20 uji lulus; typecheck lulus; API setelah
restart merespons HTTP 200 pada `/api/healthz`. Ini memverifikasi lingkungan
pengembangan, bukan klaim perubahan telah dipublikasikan ke produksi.

## Dukungan kolektor HTTPS opsional

Adapter JSON generik tetap tersedia untuk kolektor yang kontraknya telah
diverifikasi, **bukan** integrasi Putlog resmi. Pilih provider `https`, simpan
`DOCUMENT_SIGNATURE_ALERT_URL` dan opsional `DOCUMENT_SIGNATURE_ALERT_TOKEN`
melalui Secrets. Jangan konfigurasikan sebelum memastikan API kolektor.
Provider Slack tidak menggunakan variabel URL/token ini.

Kontrak: POST HTTPS, redirect ditolak, `Content-Type: application/json`,
opsional `Authorization: Bearer <token>`, sukses 2xx, respons tidak dicatat.
Body adalah satu objek dengan field `event`, `severity`, `reason`,
`signatureAgeHours`, `hoursUntilExpiry`, `consecutiveFailures`, `action`.
Tanpa konfigurasi, dicatat `scan_signature_delivery_unconfigured`.
