# Pengumuman simpan profil

## Batas bukti otomatis

`src/components/profile-form.test.tsx` memeriksa kontrak live region:
area `role="status"` sudah terpasang kosong sebelum penyimpanan, memakai
`aria-live="polite"` dan `aria-atomic="true"`, lalu menerima teks pada pembaruan
terpisah. Area yang sama bertahan ketika respons mengganti cache dan meremount
draf. MutationObserver memeriksa satu pembaruan berisi pesan per keberhasilan,
termasuk dua penyimpanan berturut-turut dengan data yang sama. Refetch dan
penolakan tidak menghasilkan pengumuman sukses. Pergantian akun membatalkan
pengumuman yang masih tertunda.

Uji DOM ini **tidak mendengarkan keluaran pembaca layar**. Jeda 100 ms memberi
browser kesempatan memproses keadaan kosong sebelum teks identik dimasukkan
kembali; ini bukan jaminan perilaku semua kombinasi browser dan pembaca layar.

## Pemeriksaan dengan pembaca layar nyata

Jalankan dengan NVDA + Firefox/Chrome di Windows dan VoiceOver + Safari di macOS.
Catat versi browser, versi pembaca layar, dan hasil aktual; jangan menganggap
daftar langkah berikut sebagai hasil uji yang sudah dijalankan.

1. Masuk dengan akun uji, buka Pengaturan, aktifkan pembaca layar dan pencatatan
   ucapan (Speech Viewer NVDA atau Caption Panel VoiceOver).
2. Ubah nama tampilan, fokuskan tombol Simpan perubahan, lalu aktifkan lewat
   keyboard. Setelah respons sukses, tunggu antrean ucapan `polite` selesai.
   Harus terdengar **“Profil berhasil disimpan.” sekali**, bukan nol atau dua kali.
3. Ulangi dengan organisasi dan peran. Draf yang diperbarui tidak boleh
   menghilangkan pengumuman.
4. Simpan lagi dua kali tanpa perubahan nilai, tunggu tiap respons selesai.
   Pesan yang sama harus diumumkan satu kali untuk setiap simpan.
5. Pastikan hanya satu pesan sukses terlihat. Pemuatan ulang data latar belakang
   tidak boleh mengumumkan keberhasilan baru.
6. Dengan respons gagal terkontrol, pastikan tidak ada ucapan sukses baru dan
   pesan kegagalan tetap tersedia.
7. Ganti akun atau tinggalkan halaman segera setelah sukses; tidak boleh ada
   pengumuman sukses tertunda milik formulir yang sudah ditinggalkan.

Status pemeriksaan ucapan nyata: **belum dijalankan dalam lingkungan Linux ini**.
