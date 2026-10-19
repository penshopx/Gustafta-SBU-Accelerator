# Regresi siklus cetak

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

Uji ini tidak membuktikan interaksi dialog sistem operasi, pagination PDF,
atau perilaku Firefox/Safari. Pagination tetap diuji terpisah dengan
`pnpm --filter @workspace/api-server test:print`.
