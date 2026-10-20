# Sumber Asisten SBU

Asisten melakukan retrieval lokal atas ringkasan terkurasi rujukan persiapan
yang sudah dicatat pada `regulatory-basis.md`. Ini bukan indeks seluruh PDF,
pencarian internet, autentikasi salinan, atau telaah ahli baru.

## Korpus dan batas persetujuan

- Permen PU 6/2025: metadata JDIH yang diperiksa 26 September 2026;
  ringkasan Lampiran I PDF halaman 266 serta Pasal 20–21 PDF halaman 12–13.
- Kepdirjen 281/KPTS/DK/2026: ringkasan surat pengantar PDF halaman 1,
  diktum KEEMPAT–KELIMA halaman 4, dan skema SMAP halaman 27–32.
  URL kanal DJBK bukan tautan salinan keputusan terautentikasi.
- Status `verified` **hanya** dipakai untuk metadata penerbit pada tanggal
  pemeriksaan terdokumentasi. Tidak berarti seluruh teks, status sekarang,
  kesiapan SIJK, atau penerapan permohonan telah diverifikasi.
- Ringkasan salinan memakai `unverified` dan menyertakan batas penelaahan.
  Tidak ada keputusan baru yang mengesahkan aturan aktif.
- `sbu-requirements-review.md` dan `bg001-bujkn-requirements-draft.md`
  tetap draf, tidak dimasukkan ke korpus. Pertanyaan angka BG001 tanpa
  sumber yang disetujui harus dijawab belum terverifikasi.
- Tanggal transisi tetap ditahan. Tidak ditemukannya surat bukan bukti
  surat belum diterbitkan. Telaah resmi yang masih antre tidak diasumsikan selesai.

## Penarikan dan penggantian versi setelah telaah

Persetujuan untuk **dipakai sebagai ringkasan retrieval** berbeda dari status
`verified`, keabsahan hukum, serta verifikasi transisi di Pusat regulasi.
Keputusan pada alur ini tidak mengubah semuanya itu, tidak mengambil sumber
live, dan tidak mengaktifkan matriks BG001.

Katalog kode `CHAT_SOURCE_VERSIONS` mempertahankan versi snapshot yang tidak
boleh diedit di tempat. Identitas awal adalah `pu6-20260926-r1` dan
`dk281-20260926-r1`. ID kutipan berbentuk
`pu6-smap@pu6-20260926-r1`, sehingga ID tanpa versi dan ID versi yang
diganti tidak dapat digunakan sebagai kutipan versi baru.
Katalog awal berstatus baseline: persetujuan terbatas berdasarkan cakupan
persiapan dan pemeriksaan 26 September 2026 di atas, bukan keputusan telaah
baru atau verifikasi live. Baseline hanya dipakai sebelum ada keputusan
tersimpan untuk sumber tersebut.

Alur operasional untuk penelaah resmi melalui API (bukan formulir pengguna):

1. Masuk menggunakan akun penelaah yang sudah diizinkan oleh allowlist server
   yang sama dengan penelaah transisi. Pilihan peran chat, profil, ataupun
   header pemilik tidak memberi kewenangan penelaah.
2. Baca `GET /api/openai/sbu/source-reviews`, dengan
   `X-SBU-Form-Owner` sesuai akun sesi. Respons memuat versi terkurasi dan
   riwayat keputusan; revisi awal per `sourceKey` adalah 0.
3. Setelah telaah manusia yang sah, kirim
   `POST /api/openai/sbu/source-reviews`, dengan header pemilik yang sama:

   ```json
   {
     "sourceKey": "permen-pu-6-2025",
     "versionId": "pu6-20260926-r1",
     "expectedRevision": 0,
     "status": "withdrawn",
     "reason": "Ringkasan ditarik setelah telaah; isi alasan yang sebenarnya.",
     "reviewReference": "Rujukan bukti atau catatan telaah yang sebenarnya"
   }
   ```

   Contoh ini bukan keputusan yang sudah diambil. `reviewReference` wajib
   mengacu pada telaah yang benar-benar telah dilakukan; API tidak melakukan
   autentikasi dokumen bukti atau menggantikan keahlian penelaah.
   `withdrawn` (dicabut) dan `not_approved` (tidak lagi disetujui) sama-sama
   mengeluarkan seluruh cuplikan versi sumber saat ini. Metadata dan ringkasan
   Permen dalam satu versi ditarik bersama. Dokumen lain tetap tersedia.
4. Untuk mengganti versi, tambahkan snapshot terkurasi baru melalui perubahan
   kode yang ditelaah: `sourceKey` sama, `versionId` baru, `baseline: false`,
   ID kutipan baru dan kata kunci yang sesuai. Pertahankan entri versi lama.
   Jangan memasukkan draf atau menaikkan cakupan/status verifikasi tanpa
   bukti dan telaah yang sesuai. Setelah versi tersedia pada seluruh server,
   penelaah merekam `approved` untuk versi baru dengan revisi keputusan
   terbaru dan rujukan telaah. Kehadiran versi baru di katalog **tidak**
   otomatis menyetujuinya. Persetujuan versi baru mengganti versi aktif
   secara atomik; tidak ada dua versi aktif atau fallback ke versi lama.
5. Jika mendapat 409, baca ulang dan telaah keputusan terbaru sebelum
   mengirim keputusan baru. Jangan mengulang otomatis. Waktu, pelaku, revisi,
   alasan, rujukan telaah, serta snapshot kutipan disimpan append-only di
   PostgreSQL. Keputusan tidak dapat diedit/dihapus lewat API atau SQL biasa.
   Pemilik database tetap memiliki kewenangan administratif atas penyimpanan.

Setiap permintaan chat membaca keputusan bersama tanpa cache antar-permintaan.
Kesalahan membaca keputusan menghentikan permintaan sebelum AI/kuota dipakai;
bukan kembali diam-diam ke baseline. Sesudah AI selesai, server memeriksa
kembali sumber: jika konteksnya dicabut/diganti selama generasi, seluruh
jawaban ditolak (503), termasuk jawaban tanpa penanda kutipan. Percobaan yang
sudah dikirim ke AI tetap mengikuti aturan kuota yang ada.
Versi yang tidak ada pada server lama saat rolling deployment tidak boleh
membuatnya kembali menggunakan baseline; sumber itu sementara tidak tersedia.
Snapshot yang berubah tanpa identitas baru juga ditolak setelah persetujuan.

Kutipan dalam jawaban yang sudah pernah diterima tetap merupakan snapshot
historis, bukan jaminan persetujuan kini. Pada permintaan berikutnya, riwayat
pesan tidak dapat menghidupkan kembali kutipan yang dicabut. Fitur ini tidak
menyegarkan tampilan Pusat regulasi antar-sesi dan tidak mengubah konsultasi
kasus menjadi alur retrieval.

## Alur dan keamanan

Retrieval memakai pertanyaan pengguna terakhir, paling banyak empat ringkasan.
Riwayat pesan, URL dari pengguna, profil, kasus, dan dokumen privat tidak
menjadi sumber retrieval. Persetujuan pengiriman teks manual tetap wajib.
Tidak ada koneksi Gustafta atau pengambilan dokumen otomatis.

Model mengembalikan JSON `answer` dan `citationIds`. Penanda `[id]`
menghubungkan bagian jawaban ke kartu sumber. Server menolak ID tidak ditemukan,
ID yang hanya ada pada riwayat lama, penanda yang tidak dinyatakan, ID tanpa
penanda, JSON rusak, dan URL buatan model. Metadata kartu diambil dari korpus,
bukan klaim model. Kegagalan menghasilkan respons 503 yang tidak memuat
jawaban/kutipan tak tervalidasi.

Validasi tersebut memeriksa referensi terstruktur, **bukan** pembuktian semantik
seluruh jawaban atau jaminan model bebas halusinasi. Ringkasan bukan kutipan
verbatim. Korpus belum memiliki semua persyaratan atau verifikasi hukum terkini.

Kartu sumber dan hasil “Salin jawaban” membawa dokumen, versi, locator,
ringkasan, tanggal pemeriksaan, status, cakupan, URL dan batas verifikasi.
Percakapan tetap sementara di memori halaman. Konsultasi kasus tersimpan
merupakan alur terpisah dan tidak diubah menjadi jawaban berkutip oleh pekerjaan ini.

## Pemeriksaan terfokus

```sh
pnpm --filter @workspace/api-server exec node --test test/sbu-chat-route.test.mjs
pnpm --filter @workspace/api-server exec node --test test/sbu-chat-source-reviews.test.mjs
pnpm --filter @workspace/gustafta-sbu exec node --import tsx --test src/components/chat-citations.test.tsx
```
