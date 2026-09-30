# Kontrak baca profil Ruang Simpan

Acuan integrasi dari spesifikasi yang diberikan pengguna. Base URL yang
dikonfirmasi pengguna: `https://gustafta.my.id`. Keberadaan kontrak tidak
membuktikan bahwa versi deployment sudah menyediakan endpoint ini.

## Cakupan dan izin

SBU hanya membaca profil perusahaan dari sumber resmi Ruang Simpan.
Gunakan `profile:read`; tidak meminta `profile:write`, `files:read`, atau
`files:write`. Jangan menyalin profil ke database SBU atau mengganti
kegagalan dengan data rekaan.

Pemilik harus login ke Gustafta, mengisi profil, dan membuat koneksi aplikasi.
Pemilik harus aktif. Token hanya ditampilkan sekali, berlaku 90 hari, dan
dapat dicabut. Token nyata hanya disimpan sebagai secret server SBU:
tidak di frontend, URL, log, atau berkas unggahan.

## Permintaan hulu

- HTTPS server-ke-server.
- `GET /api/v1/ruang-simpan/company-profile`
- Header `Authorization: Bearer <token-koneksi>`
- Tidak ada body atau parameter `user_id`.
- Token menentukan pemilik profil; panggilan browser lintas domain tidak didukung.

## Respons hulu

HTTP 200, objek **langsung**, bukan pembungkus `profile`:

```json
{
  "name": "PT Contoh",
  "nib": "123456789",
  "address": "Jakarta",
  "revision": 1,
  "updated_at": "2026-10-01T00:00:00.000Z"
}
```

Jika sumber belum diisi, respons sukses yang sah adalah:

```json
{
  "name": "",
  "nib": "",
  "address": "",
  "revision": 0,
  "updated_at": null
}
```

Header respons: `Cache-Control: private, no-store`.

| Status hulu | Makna |
| --- | --- |
| 401 | Token salah, kedaluwarsa, dicabut, atau pemilik tidak aktif |
| 403 | Izin `profile:read` tidak tersedia |
| 429 | Batas permintaan terlampaui |
| 503 | Izin/profil tidak dapat diverifikasi atau dibaca |

Batas yang dinyatakan spesifikasi: 60 permintaan per menit per koneksi;
pemeriksaan awal token juga dibatasi 60 per menit per IP.
Kegagalan tidak boleh diperlakukan sebagai profil kosong.

## Batas lokal SBU

Model yang dipilih pengguna: banyak perusahaan, koneksi terpisah per pemilik.
Pemetaan akun SBU ke pemilik Gustafta harus diverifikasi sebelum konfigurasi;
jangan menganggap email atau ID kedua aplikasi otomatis setara.
Lihat `ruang-simpan-sbu-setup.md` untuk pemetaan secret.

Endpoint SBU: `GET /api/ruang-simpan/company-profile`.
Respons sukses lokal membungkus profil sebagai `{userId, profile}` hanya
untuk mengikat respons ke identitas SBU yang sudah diautentikasi.
Ini **bukan** bentuk respons hulu.

Sesi SBU yang tidak sah menghasilkan 401. Koneksi belum dipetakan menghasilkan
404. Kegagalan token/izin hulu menghasilkan 424, bukan logout sesi SBU.
429 dipertahankan; konfigurasi, jaringan, HTML, dan respons tidak sah menjadi
503. Seluruh respons lokal diberi `private, no-store`.

Jangan menyatakan integrasi live berhasil sebelum respons autentikasi dan
profil nyata diverifikasi pada deployment Gustafta yang benar.