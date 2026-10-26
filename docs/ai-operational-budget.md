# Anggaran operasional AI gabungan

## Kebijakan

Pengeluaran seluruh akun dibatasi bersama, bukan hanya jumlah percobaan per
akun. Paket pembayaran, hak langganan, dan kuota Asisten peran tidak diubah.
Ketiga fitur berbagi batas global, tetapi masing-masing memiliki batas sendiri
agar satu fitur tidak menghabiskan jatah fitur lain.

| Cakupan | Batas harian USD | Batas bulanan USD |
| --- | ---: | ---: |
| Global seluruh akun/fitur | 10 | 100 |
| Asisten peran (`assistant`) | 4 | 40 |
| Klinik (`consultation`) | 3 | 30 |
| Bedah Dokumen (`document_analysis`) | 3 | 30 |

Hari berganti pukul 00.00 UTC / 07.00 WIB. Bulan berganti tanggal 1 pukul yang
sama. Jam PostgreSQL dibaca **setelah** lock bersama diperoleh. Semua instance
harus terhubung ke database anggaran yang sama. Tidak ada penghitung/fallback
anggaran dalam memori.

## Pencadangan biaya, bukan tagihan aktual

### Indikator sebelum pengiriman Asisten

`GET /api/openai/sbu/budget` membaca ketersediaan untuk model Asisten dengan
snapshot transaksi PostgreSQL read-only. Endpoint memerlukan sesi dan
`X-SBU-Form-Owner` yang sesuai, memakai `private, no-store`, serta tidak
menampilkan nominal saldo, tarif, sidik kebijakan, atau data akun lain.
Pembacaan tidak membuat baris, mengubah alarm, mencadangkan biaya, atau
memanggil AI. Ini terpisah dari `GET /api/openai/sbu/quota` milik akun.

UI membedakan tersedia, tidak cukup untuk satu reservasi penuh, dan belum dapat
diverifikasi. Pengiriman melalui tombol maupun Enter diblokir jika pemeriksaan
anggaran gagal, belum selesai, atau tidak tersedia; draf dipertahankan.
Status diperbarui setiap 15 detik, saat fokus/mount, setelah pengiriman, serta
melalui tombol pemeriksaan manual. Nilai snapshot tidak menjamin ketersediaan
saat dikirim: reservasi atomik yang sudah ada tetap menjadi keputusan akhir.
Tanggal batas periode hanya ditampilkan jika reset berpotensi mengatasi seluruh
penghalang; batas yang lebih kecil dari satu reservasi perlu ditinjau pengelola.

Tabel pengunci yang belum berisi baris sebelum reservasi pertama tidak memblokir
pembacaan status, dan GET tidak membuat baris tersebut. Reservasi menginisialisasi
baris `id=1` dengan INSERT idempoten dalam transaksi yang sama sebelum mengambil
row lock. Ini hanya inisialisasi data, bukan migrasi skema saat startup. Kegagalan
inisialisasi/penulisan tetap menolak permintaan; tidak ada reset penghitung atau
riwayat tarif. Tabel yang belum tersedia tetap memblokir layanan sampai skema
diterapkan melalui alur Publish.

Sebelum satu panggilan provider, cadangkan batas atas biaya **seluruh kapasitas
input model** (termasuk prompt sistem, riwayat, konteks, teks, gambar/PDF) dan
8.192 token output, termasuk reasoning. Perhitungan integer:

```
ceil((kapasitas_input * tarif_input + 8192 * tarif_output) / 1000000)
```

Tarif dinyatakan dalam **mikrodolar USD per sejuta token**, dengan 1 USD =
1.000.000 mikrodolar. Pembulatan selalu ke atas. Angka kapasitas input harus
batas maksimum yang dapat ditagih untuk SATU request model di provider/proxy,
bukan perkiraan token teks, panjang pertanyaan, token cache, atau jumlah halaman
terpilih. Cadangan penuh sengaja konservatif; bukan laporan tagihan aktual.

Semua SDK retry dimatikan, termasuk Klinik. Retry manual harus mencadangkan
biaya baru. Tidak ada pengembalian cadangan pada kegagalan provider, jawaban
tidak valid, timeout, pembatalan, proses mati, atau kegagalan menyimpan hasil.
Provider mungkin sudah menagih walaupun jawaban tidak diterima. Cadangan tidak
kedaluwarsa bersama lease permintaan dan tidak dilepas saat klien putus.

## Aktivasi aman

**Setiap model ditolak (503) sampai mempunyai profil tarif yang terverifikasi.**
Tidak ada tarif bawaan yang ditebak untuk alias `gpt-5.6-terra`. Fitur non-AI,
daftar/riwayat, dan dokumen asli tetap tersedia. Ini bukan perubahan paket.

Konfigurasi server `AI_BUDGET_PRICING_JSON` untuk fitur GPT wajib mempunyai tepat field:

- `model`: `gpt-5.6-terra`;
- `validUntil`: batas waktu persetujuan profil, UTC ISO lengkap
  `YYYY-MM-DDTHH:mm:ss.000Z`;
- `maxInputTokens`: integer positif, maksimal 10.000.000; **kapasitas input
  maksimum model terverifikasi**, juga mencakup token input multimodal;
- `inputMicrosPerMillion`, `outputMicrosPerMillion`: integer positif batas
  atas tarif input/output, maksimal 1.000.000.000.000.

Pengelola harus memverifikasi kapasitas, alias model, seluruh komponen biaya,
tarif reasoning/output dan biaya tambahan proxy terhadap penyedia/invoice.
Gunakan tarif input non-cache termahal. Masukkan biaya tambahan sebagai batas
tarif yang cukup besar. Jika biaya tidak dapat dibatasi dengan profil ini,
**jangan aktifkan AI**. Konfigurasi harga tidak membuktikan harga provider;
pembatas hanya menjamin biaya di bawah pagu selama profil merupakan batas
atas biaya nyata. Model/penyedia baru wajib diaudit sebelum dipakai.

Profil hilang, kedaluwarsa, tanggal tidak sah, harga nol/negatif/desimal,
kapasitas tidak sah, field asing, atau perhitungan di luar rentang ditolak.
Jangan menyimpan secret di JSON ini; JSON hanya konfigurasi biaya.

`AI_BUDGET_LIMITS_JSON` opsional untuk mengganti **seluruh** tabel batas, dalam
mikrodolar, misalnya nilai bawaan:

```json
{
  "global": {"day": 10000000, "month": 100000000},
  "assistant": {"day": 4000000, "month": 40000000},
  "consultation": {"day": 3000000, "month": 30000000},
  "document_analysis": {"day": 3000000, "month": 30000000}
}
```

Setiap nilai integer positif maksimal 1.000.000.000.000. Batas harian tidak
boleh melampaui bulanan dan batas fitur tidak boleh melampaui global. Jika satu
cadangan maksimum lebih besar dari sisa anggaran, request langsung ditolak,
meskipun belum mencapai 100%. Jangan menaikkan anggaran otomatis.

## Konsistensi, perubahan konfigurasi, dan kegagalan

Startup API menerapkan migrasi idempoten `lib/db/migrations/ai-budget.sql`.
Satu transaksi mengunci baris global permanen kemudian membaca jam database,
memeriksa empat penghitung (global/fitur × hari/bulan), dan menambah keempatnya
sebelum commit. Tidak ada transaksi terbuka selama panggilan AI.

Sidik kebijakan mengikat tarif, kapasitas, output, masa berlaku, dan batas.
Sidik batas agregat dipisahkan dari sidik harga per model; semuanya diperiksa
secara atomik. Konfigurasi berbeda antar-instance ditolak, bukan memilih anggaran lebih besar.
Kebijakan yang sudah dipakai dipertahankan selama periode aktif, termasuk bulan.
Perubahan harga/batas/masa berlaku di tengah bulan akan memblokir AI; jangan
menghapus penghitung untuk mengaktifkannya kembali. Pilihan aman adalah
menyiapkan konfigurasi yang sama pada semua instance untuk bulan baru.
Perubahan darurat di tengah bulan memerlukan penghentian semua panggilan AI,
rekonsiliasi cadangan berjalan, peninjauan biaya/batas baru oleh pengelola, dan
perubahan sidik kebijakan terkoordinasi tanpa mengurangi cadangan yang sudah
dicatat. Tidak ada endpoint publik untuk melewati prosedur tersebut.

Penghitung format lama hanya diadopsi jika sidiknya tepat cocok dengan profil
GPT lama yang tersedia. Saldo dan penanda alarm dipertahankan, dan sidik harga
GPT dicatat sebelum adopsi. Riwayat yang tidak dikenal ditolak. Menambahkan
Claude tidak mereset saldo atau memerlukan tebakan tarif GPT; jika ada riwayat
lama yang tidak dapat dikenali, Claude juga tetap diblokir.

## Pilot Claude untuk Asisten Peran

Hanya Asisten Peran beralih ke `claude-sonnet-5-5` melalui Replit AI Integrations.
Klinik dan Bedah Dokumen mempertahankan GPT dan tetap memerlukan profil harganya
sendiri. Tidak ada fallback model otomatis. MCP, integrasi Gustafta, serta
pengiriman otomatis profil/kasus/dokumen tidak diaktifkan.

Profil non-secret `AI_BUDGET_CLAUDE_PRICING_JSON` mempunyai struktur yang sama,
dengan model Claude. Profil pengembangan yang ditinjau pada 26 Oktober 2026:

```json
{
  "model": "claude-sonnet-5-5",
  "validUntil": "2027-01-01T00:00:00.000Z",
  "maxInputTokens": 1000000,
  "inputMicrosPerMillion": 2000000,
  "outputMicrosPerMillion": 10000000
}
```

Sumber harga dan konteks 1 juta token:
https://www.anthropic.com/claude/sonnet .
Replit menyatakan penagihan integrasi mengikuti harga API publik provider:
https://docs.replit.com/features/integrations/replit-ai-integrations .
Sumber publik dan konfigurasi bukan bukti invoice atau konektivitas live.
Profil ini disetel **hanya pada development**; produksi belum dikonfigurasi
atau dipublikasikan.

Harga $2/juta input dan $10/juta output menghasilkan cadangan penuh
**$2,08192 per percobaan**. Dengan pagu Asisten $4/hari/$40/bulan, hanya satu
percobaan harian dan paling banyak 19 percobaan bulanan gabungan dapat diterima
selama kebijakan ini dipakai. Kuota 30 percobaan per akun tidak menjamin anggaran
operasional tersedia. Ini sengaja mempertahankan kebijakan kapasitas penuh:
guard ukuran teks lokal tidak dipakai untuk mengurangi cadangan biaya.

Persetujuan baru menyebut provider, model, dan cakupan teks yang dikirim.
Kontrak mewajibkan `providerConsent=anthropic-claude-sonnet-5-5-v1`; tab/bundle
lama yang hanya mengirim consent generik ditolak sebelum reservasi dan provider.
Sumber publik diperiksa kembali setelah jawaban untuk mendeteksi penarikan versi.

Penyimpanan gagal, lock hilang, timeout lock/query, kebijakan berbeda, atau commit
tidak dapat dikonfirmasi: **fail closed**, tidak memanggil provider. Commit yang
mungkin berhasil tidak dibatalkan/refund. Transaksi gagal sebelum commit
dibatalkan seluruhnya. Batas `lock_timeout=3s`, `statement_timeout=5s`.

Respons 503 membawa pesan Indonesia dan kode `ai_budget_exhausted` atau
`ai_budget_unavailable`. Jalur Asisten tetap menyelesaikan lease akun. Reservasi
kuota akun sudah dihitung sebelum pemeriksaan anggaran, sehingga penolakan
anggaran dapat memakai satu percobaan akun tetapi tidak mengirim teks ke AI.

## Alarm dan privasi

Log terstruktur `ai_budget_warning` muncul saat cadangan mencapai 80% untuk
setiap cakupan/periode; `ai_budget_rejected` muncul saat cadangan berikutnya
tidak muat. Penanda atomis di database mencegah setiap instance mengirim ulang
alarm yang sama. Penolakan berikutnya tetap berlaku tanpa spam log.
`ai_budget_unavailable` berlevel error mencatat kegagalan pemeriksaan tanpa
error mentah. Pengelola dapat memfilter ketiga nama event pada log API.

Metadata hanya event, cakupan fitur/global, jenis periode, jumlah cadangan dan
batas dalam mikrodolar. Tabel hanya penghitung agregat, awal periode, sidik
kebijakan dan penanda alarm; tidak ada identitas akun, request ID, isi chat,
judul/nama/path dokumen, secret, prompt/output, atau error provider mentah.
Ini alarm log operasional, **bukan** notifikasi email/WhatsApp/kanal eksternal.
Penanda alarm dicommit sebelum log dikeluarkan; proses mati tepat setelah commit
dapat kehilangan satu log alarm, tetapi tidak dapat meloloskan biaya tambahan.

## Rute yang dilindungi

- `POST /api/openai/sbu/messages`: setelah autentikasi, persetujuan, validasi,
  sumber dan reservasi kuota akun; sebelum generator.
- `POST /api/consultations/:id/messages`: setelah pemeriksaan pemilik,
  revisi, replay, batas/konteks; sebelum generator. Replay yang sudah tersimpan
  tidak mencadangkan anggaran baru.
- `POST /api/cases/:id/documents/:documentId/analyses`: setelah pemeriksaan
  pemilik, versi, malware dan persiapan halaman terpilih; sebelum generator.
  Menghitung halaman/pratinjau dan membaca hasil lama tidak memakai anggaran.

Uji terfokus (harga dan provider sintetis, PostgreSQL terisolasi dengan dua login
terbatas; tidak ada panggilan AI berbayar):

```
pnpm --filter @workspace/api-server exec node --test test/ai-budget-postgres.test.mjs
```
