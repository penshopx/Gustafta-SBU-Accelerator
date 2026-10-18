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
pnpm --filter @workspace/gustafta-sbu exec node --import tsx --test src/components/chat-citations.test.tsx
```
