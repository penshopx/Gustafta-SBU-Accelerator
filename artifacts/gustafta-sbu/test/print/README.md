# Regresi siklus cetak dan unduhan HTML

Jalankan `pnpm --filter @workspace/gustafta-sbu test:print`.
Memerlukan Chromium di `/repl/tools/bin/chromium`, atau tentukan
`PRINT_CHROMIUM_PATH` ke executable Chromium setempat. Browser yang tidak
tersedia membuat uji gagal, bukan dilewati diam-diam.

Fixture membangun komponen `CasePreparationExport`, hook pemilik formulir,
klien API, dan generator HTML ringkasan yang asli. Semua respons ringkasan
disediakan di batas jaringan dengan data sintetis; permintaan di luar server
fixture ditolak dan menggagalkan uji. Tidak menggunakan Clerk, sesi login,
database, kredensial, maupun data pengguna. Bundle sementara berada di direktori
temporer dan dihapus bersama browser/server dalam `finally`.

Uji native membungkus, **bukan mengganti**, `contentWindow.print()` yang asli,
memastikan pemanggilan tepat satu kali setelah `srcdoc` selesai dimuat, serta
mensyaratkan event `beforeprint` asli (`isTrusted`) dari Chromium. Panggilan native
yang tidak memasuki siklus cetak tidak cukup untuk lulus.

Chromium headless tidak selalu menampilkan dialog atau mengirim `afterprint`.
Karena itu, penutupan dialog diuji dengan event `afterprint` terkontrol.
Skenario pembersihan lain sengaja menahan batas `print()` agar iframe dapat
diamati, lalu memicu pergantian kasus, unmount, atau callback timer lima menit
tanpa menunggu lima menit. Uji memeriksa penghapusan iframe, listener dan timer,
event `load` berulang, callback terlambat, serta pesan kegagalan yang berbeda
untuk permintaan ringkasan dan pencetakan. CSP dan escaping diperiksa pada
dokumen iframe yang benar-benar dimuat.

Mode unduhan memakai fixture dan pembatasan jaringan yang sama. Probe
membungkus `URL.createObjectURL`, `URL.revokeObjectURL`, dan klik anchor tanpa
mengganti implementasi native. Uji memeriksa nama berkas
`ringkasan-persiapan-sbu.html`, Blob bermime `text/html;charset=utf-8`, isi HTML
utuh, URL anchor, serta berkas yang benar-benar diunduh Chromium pada ekspor
berikutnya. Tidak ada iframe cetak yang dibuat dalam mode ini.

Timer pembersihan satu detik ditahan dan dipicu secara deterministik, sementara
timer browser lainnya tetap berjalan. URL dan timer harus dibersihkan setelah
timeout, pergantian `caseId`, unmount, dan ekspor berikutnya; URL yang direvoke
harus tidak dapat dibaca lagi. Respons ringkasan gagal tidak boleh membuat Blob
URL, klik unduhan, atau timer pembersihan.

Respons sukses yang tertunda juga diuji sebelum HTML tersedia: pergantian
kasus, unmount, tampilan yang disembunyikan oleh Suspense, serta perubahan
alamat sebelum teardown React. Transport fixture sengaja mengabaikan abort
agar pengabaian hasil lama diperiksa secara terpisah dari pembatalan jaringan.
Hasil lama tidak boleh membuat Blob, klik unduhan, iframe, atau pesan kesalahan;
ekspor berikutnya harus tetap menghasilkan berkas native yang utuh.

Injeksi kegagalan klik anchor melempar sebelum klik native dijalankan.
Uji mewajibkan URL langsung direvoke, timer dibatalkan, pesan kegagalan
ditampilkan, dan kedua tombol kembali aktif. Percobaan ulang harus menghasilkan
unduhan native yang utuh dengan URL baru dan menghapus pesan lama. Timeout
diikuti unmount tidak boleh merevoke ulang URL yang sudah dilepas.

Uji ini tidak membuktikan interaksi dialog sistem operasi, pagination PDF,
atau perilaku Firefox/Safari. Pagination tetap diuji terpisah dengan
`pnpm --filter @workspace/api-server test:print`.
