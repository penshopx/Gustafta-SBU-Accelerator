---
name: Arah model AI aplikasi
description: Keputusan pengguna tentang Claude sebagai model utama dan model pendukung.
---

Claude ditetapkan sebagai model utama aplikasi SBU Accelerator. GPT, Gemini, atau model lain digunakan sebagai pendukung sesuai tugasnya.

**Why:** Pengguna menyetujui kombinasi model dan meminta Claude ditetapkan sebagai model utama.

**How to apply:** Gunakan keputusan ini saat merancang pembagian tugas model. Keputusan arsitektur ini bukan bukti bahwa konfigurasi layanan sudah diubah; pemilihan varian model, akses provider, biaya, dan persetujuan pengiriman data harus ditetapkan sebelum implementasi.

Pengguna menyetujui adopsi bertahap agent harness, dimulai dari rancangan alur tetap Simulator SBU baru/perpanjangan → temuan kelengkapan → rencana tindak lanjut → tinjauan manusia, bukan agen bebas bertindak.

**Why:** Pengguna mengikuti saran memulai orkestrasi terkontrol di atas modul yang ada, bukan membangun ulang atau langsung menggunakan banyak agen.

**How to apply:** Pertahankan kendali izin, persetujuan, batas biaya, dan penyimpanan pada aplikasi. Persetujuan atas penyusunan rancangan ini bukan instruksi mengimplementasikan integrasi atau mengirim dokumen privat.

Pengguna kemudian memilih Asisten Peran sebagai pilot Claude Sonnet 5.5 dan
menyetujui tarif publik dengan pagu anggaran yang sudah ada.

**Why:** Pengguna memilih pilot, varian model, dan pendekatan anggaran secara eksplisit.

**How to apply:** Batasi peralihan awal pada Asisten Peran. Jangan mengalihkan
fitur lain hanya karena memakai helper yang sama. Pergantian provider memerlukan
persetujuan dengan pengungkapan provider baru; consent dari tab/bundle lama
bukan izin pengiriman ke provider berbeda. Pagu tetap menggunakan cadangan
kapasitas penuh model, bukan estimasi panjang teks.
