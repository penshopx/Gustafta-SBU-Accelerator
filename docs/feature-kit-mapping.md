# Peta adaptasi Gustafta Feature Kit untuk SBU Accelerator

Tanggal: 10 Oktober 2026  
Sumber: GUSTAFTA FEATURE KIT 1.0.0  
Status: **dokumentasi saja; bukan izin implementasi atau laporan kelulusan produksi**.

## 1. Keputusan dan batas pekerjaan

Pengguna memilih **Peta adaptasi saja**. Dokumen ini memilih konsep yang relevan,
memetakan implementasi yang ditemukan, dan menjelaskan kekurangannya.
Tidak ada perubahan kode aplikasi, database, provider, secrets, atau deployment.
Tidak ada pengujian aplikasi baru ataupun pengambilalihan tugas yang sedang antre.

SBU Accelerator tetap mandiri. Data dan berkas dikelola di aplikasi SBU sendiri.
Tidak ada koneksi, sinkronisasi, pemindahan akun/data, atau foreign key ke Gustafta.
Integrasi masa depan memerlukan keputusan eksplisit baru setelah kedua aplikasi
teruji dalam penggunaan nyata. F22 tidak dipilih.

Paket sumber berisi spesifikasi 22 modul, bukan plugin atau kode aplikasi.
Hash enam berkas cocok dengan manifest di dalam ZIP; pemeriksaan ini tidak
membuktikan keaslian penerbit, keamanan runtime, maupun kesiapan produksi Gustafta.
Path kode Gustafta dalam kit adalah referensi sumber, bukan berkas yang tersedia
atau dapat disalin dari proyek ini.

## 2. Arti status

- **Sudah ada:** kemampuan dasar ditemukan pada kode tujuan, bukan seluruh
  persyaratan modul kit telah terpenuhi.
- **Perlu adaptasi:** ada fondasi, tetapi cakupan kit/domain membutuhkan penguatan.
- **Perlu dibuat:** kemampuan yang dipetakan belum ditemukan sebagai alur lengkap
  UI, API, dan persistensi dalam pemeriksaan ini.
- **Tertunda:** tidak dipilih untuk tahap awal atau membutuhkan prasyarat baru.

Pemeriksaan kode adalah bukti implementasi, bukan pemeriksaan live. Hasil pengujian
Ruang Simpan/Bedah Dokumen yang dilaporkan sebelumnya dibatasi pada alur dan versi
yang diuji saat itu; tidak diulang untuk peta ini dan bukan audit semua modul setelah
perubahan proyek berikutnya.

## 3. Referensi kode tujuan yang ditemukan

| Ref | Berkas tujuan | Kemampuan yang dipetakan |
|---|---|---|
| R1 | `artifacts/api-server/src/app.ts`; `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`; `artifacts/api-server/src/middlewares/clerkRequestOrigin.ts` | Integrasi autentikasi dan konteks permintaan yang sudah ada. |
| R2 | `artifacts/api-server/src/routes/sbu.ts`; `artifacts/gustafta-sbu/src/components/account-queries.tsx`; `artifacts/gustafta-sbu/src/lib/session-request.ts` | Sesi, pembatasan pemilik, prasyarat konteks baca/tulis, kasus, bukti, penilaian, ringkasan, regulasi. |
| R3 | `lib/db/src/schema/workspace.ts`; `artifacts/api-server/src/lib/workspace-context.ts`; `artifacts/gustafta-sbu/src/components/workspace-foundation.tsx` | Ruang kerja privat, wadah klien bawaan, dan fondasi audit. Bukan keanggotaan tim. |
| R4 | `lib/db/src/schema/standalone.ts`; `artifacts/api-server/src/routes/standalone.ts`; `artifacts/gustafta-sbu/src/components/local-company-profile-page.tsx` | Profil perusahaan lokal serta metadata dan penyimpanan dokumen per kasus. |
| R5 | `artifacts/api-server/src/routes/document-vault.ts`; `artifacts/api-server/src/lib/document-storage.ts`; `artifacts/api-server/src/lib/document-validation.ts`; `artifacts/gustafta-sbu/src/components/document-vault-page.tsx`; `artifacts/gustafta-sbu/src/components/case-documents.tsx`; `artifacts/gustafta-sbu/src/components/document-metadata-dialog.tsx` | Daftar/pencarian/filter berkas, unggah/unduh privat, metadata, versi, dan penghapusan. |
| R6 | `artifacts/api-server/src/routes/document-analysis.ts`; `artifacts/api-server/src/lib/document-analysis.ts`; `artifacts/gustafta-sbu/src/components/document-analysis-panel.tsx` | Bedah Dokumen pilihan dengan persetujuan, batas pemrosesan, dan hasil tersimpan. |
| R7 | `artifacts/api-server/src/lib/sbu-rules.ts`; `artifacts/gustafta-sbu/src/components/regulations-page.tsx`; `docs/regulatory-basis.md`; `docs/sbu-requirements-review.md` | Fondasi aturan dan rujukan; dokumen telaah bukan pengesahan seluruh persyaratan. |
| R8 | `artifacts/api-server/src/routes/sbu-chat.ts`; `artifacts/api-server/src/lib/sbu-chat-policy.ts`; `artifacts/api-server/src/lib/sbu-chat-specialists.ts`; `artifacts/gustafta-sbu/src/components/sbu-chat-page.tsx` | Asisten peran/spesialis lokal dengan provider AI dan batas konteks. |
| R9 | `artifacts/api-server/src/lib/preparation-summary.ts`; `artifacts/gustafta-sbu/src/components/case-preparation-export.tsx`; `artifacts/gustafta-sbu/src/App.tsx` | Ringkasan persiapan, ekspor HTML/cetak melalui browser, dashboard dan navigasi. Bukan generator DOCX/PDF server umum. |
| R10 | `lib/api-spec/openapi.yaml`; `lib/db/src/schema/sbu.ts`; `docs/blueprint-adoption.md`; `replit.md` | Kontrak API, data kasus/profil/bukti, dan pedoman produk yang harus dipertahankan. |

Referensi ini adalah titik awal implementasi kelak, bukan daftar berkas yang perlu
ditulis ulang. Sumber hasil codegen tidak diedit manual.

## 4. Matriks seluruh modul kit

| Modul | Keputusan dan status | Penerapan SBU / kekurangan | Referensi tujuan |
|---|---|---|---|
| **F01 Akun dan sesi** | Inti — **sudah ada** | Gunakan autentikasi yang sudah dipakai. Jangan menambah login paralel, akun Gustafta, atau mengganti provider. Pencabutan sesi dan gangguan provider tetap perlu dibuktikan sesuai perubahan yang dilakukan kelak. | R1, R2 |
| **F02 Peran dan kepemilikan** | Inti — **perlu adaptasi** | Kepemilikan privat sudah menjadi dasar. Peran persona chatbot bukan membership atau hak lintas akun. Kolaborasi/tenant baru membutuhkan izin per objek; jangan menganggap fondasi privat telah menyediakan organisasi bersama. | R2, R3, R4, R5, R6 |
| **F03 Jejak audit** | Inti — **perlu adaptasi** | Ada tabel dan helper audit. Cakupan seluruh mutasi dokumen, analisis, keputusan dan notifikasi belum dibuktikan lengkap. Audit keberhasilan perlu konsisten dengan transaksi; log HTTP bukan pengganti audit bisnis. | R2, R3 |
| **F04 Profil perusahaan lokal** | Inti — **perlu adaptasi** | Form dan GET/PUT profil lokal ada. Skema yang diperiksa belum memiliki nomor revisi/`expected_revision` untuk menolak dua edit yang saling menimpa. Identitas isian bukan bukti legalitas. Jangan mengubah tugas profil yang sedang berjalan. | R4 |
| **F05 Ruang Simpan** | Inti — **perlu adaptasi** | Upload privat, metadata, kategori, catatan, pencarian, versi dan unduh ada. Dokumen terikat ke kasus; folder umum, masa berlaku, arsip/retensi serta pemindaian malware tidak dianggap otomatis tersedia. Tidak membuat penyimpanan kedua. | R4, R5 |
| **F06 Kuasa akses dokumen** | **Tertunda** | Relevan ketika konsultan/asesor lain diundang. Memerlukan identitas penerima, cakupan tindakan, masa berlaku dan pencabutan. Jangan membuka seluruh arsip atau membuat tautan publik sebagai jalan pintas. | R2, R5 sebagai fondasi; belum ada alur grant lengkap yang dipetakan |
| **F07 Pengetahuan dan sumber** | Inti — **perlu adaptasi**, telaah sebagai prasyarat | Gunakan fondasi regulasi. Kurasi sumber/versi, keterlacakan lokasi, retrieval berizin dan kegagalan ekstraksi perlu dirinci. Jangan mengaktifkan aturan draf, mengarang pasal, atau mengambil alih telaah BG001 yang antre. | R7, R8 |
| **F08 Asisten AI spesialis** | Inti — **perlu adaptasi** | Asisten peran dan spesialis ada. Penyimpanan percakapan lengkap, streaming, pelacakan penggunaan dan keterlacakan sumber tidak dianggap selesai hanya karena chatbot dapat menjawab. Provider tetap milik SBU; penggunaan AI berbiaya dan membutuhkan persetujuan sesuai konteks. | R8 |
| **F09 Dialog menuju Blueprint** | **Tertunda — tidak dipilih** | Penyusun konfigurasi/blueprint bukan Bedah Dokumen. Tidak dibutuhkan untuk mengurus dokumen dan persiapan kasus tahap awal. | Tidak mengaktifkan route/UI/tabel baru |
| **F10 Tim AI** | **Tertunda — tidak dipilih** | Tidak membuat tim agen otonom atau delegasi tool. Pilihan spesialis pada satu chatbot tidak membuktikan adanya multi-agent. | R8 hanya sebagai batas konsep |
| **F11 Workroom eksekusi** | Inti — **perlu adaptasi** | Kasus, bukti, penilaian dan ringkasan merupakan fondasi. Tahap/tugas, tenggat, keluaran, serta hubungan dengan gerbang manusia perlu dibuat tanpa menduplikasi kasus. Status selesai berarti persiapan selesai, bukan persetujuan SBU. | R2, R3, R9, R10 |
| **F12 Persetujuan manusia** | Inti — **perlu dibuat** | Definisikan tinjauan pengguna atas temuan/draf dan revisi sumber. Bukan persetujuan LSBU. Pengubahan dokumen/bukti membatalkan keputusan atas revisi lama. Kebijakan maker/checker hanya diberlakukan jika organisasi dan pemberi kewenangannya benar-benar ditetapkan. | R2, R3, R6 sebagai fondasi; model keputusan baru perlu dirancang |
| **F13 Generator dokumen** | Inti lanjutan — **perlu adaptasi** | Ekspor ringkasan sudah ada; belum merupakan studio template umum. Tambahan dapat berupa draf daftar kekurangan, surat pengantar atau ringkasan konsultasi, tanpa tanda tangan/fakta karangan. Format ekspor harus dinyatakan sesuai yang benar-benar dibangun. | R9 |
| **F14 Akademi** | **Tertunda — tidak dipilih** | Materi pembelajaran/kuis bisa dipertimbangkan tersendiri; bukan syarat minimum Workroom. Tidak menerbitkan SKK atau sertifikasi resmi. Kit tidak membuktikan fitur pembelajaran tersedia di SBU. | Tidak mengaktifkan modul baru |
| **F15 Dashboard tindak lanjut** | Inti — **perlu adaptasi** | Ringkasan kasus ada. Tambahkan prioritas tugas/dokumen hanya setelah sumbernya tersedia. Statistik harus ber-scope, konsisten dengan daftar, serta jelas saat stale/gagal. Pertahankan perbaikan dashboard yang sudah masuk. | R2, R9 |
| **F16 Notifikasi/pengingat** | Inti — **perlu dibuat** | Tahap awal berupa inbox/pengingat dalam aplikasi dari tenggat nyata. Email/WhatsApp tidak dipilih. Pengiriman proaktif kemudian membutuhkan mekanisme durable, deduplikasi dan pencabutan akses; interval memori tidak dianggap scheduler andal. | R4, R5, R9 sebagai sumber; belum ada alur notifikasi lengkap yang dipetakan |
| **F17 Paket akses** | **Tertunda — tidak dipilih** | Kesiapan komersial dapat dibahas setelah alur inti teruji. Jangan menyalin harga/paket Gustafta atau menyamakan akun aktif dengan langganan. | Tidak mengaktifkan paywall/grant baru |
| **F18 Voucher** | **Tertunda — tidak dipilih** | Bergantung F17; bukan kebutuhan persiapan dokumen. | Tidak membuat kode akses |
| **F19 Katalog/pesanan** | **Tertunda — tidak dipilih** | Bergantung model komersial dan provider pembayaran baru. Tidak memakai merchant atau transaksi Gustafta. | Tidak membuat checkout/webhook |
| **F20 Register dan tenggat** | Inti — **perlu adaptasi** | Bukti dan penilaian awal ada. Tambahkan masa berlaku dokumen, hubungan bukti dengan persyaratan yang ditelaah, tindak lanjut dan histori review. Jangan menandai lengkap sebagai patuh/tersertifikasi. | R2, R4, R5, R7 |
| **F21 Solusi sektoral** | Inti — **sudah ada** | Navigasi dan konteks SBU sudah menjadi aplikasi tujuan. Perluas fitur terpilih, bukan sektor lain atau tabel transaksi paralel. Pertahankan branding yang ada tanpa menyalin aset baru dari kit. | R9, R10 |
| **F22 Adapter Gustafta** | **Tertunda — dikecualikan tegas** | Integrasi dibatalkan untuk fase sekarang. Tidak memanggil endpoint, mengaktifkan token, memilih origin baru, atau menyinkronkan data. Default alamat di kit bukan instruksi mengubah konfigurasi SBU. | Tidak ada perubahan pada adapter/secrets lama |

### Adaptasi domain di luar nomor kit

**Bedah Dokumen:** sudah ada sebagai modul lokal di R6. Ini bukan F09.
Penguatan yang dapat direncanakan adalah peninjauan per temuan, hubungan ke sumber
regulasi yang ditelaah, dan pemilihan halaman PDF panjang. Jangan menyamakan
lokasi yang disebut AI dengan kutipan yang telah diverifikasi manusia.
Batas awal yang sudah didokumentasikan: 4 MiB, PDF maksimal 10 halaman; penyimpanan
berkas asli tetap maksimal 20 MiB per berkas.

**Klinik Konsultasi:** chatbot peran bukan otomatis klinik per kasus.
Dialog tersimpan yang memilih konteks kasus secara eksplisit dapat direncanakan
di atas F08/F11. Konsultan manusia lintas akun memerlukan kebijakan undangan dan
izin baru, termasuk pertimbangan F06/F02. Jangan mengirim profil atau semua dokumen
otomatis hanya karena pengguna membuka chat.

## 5. Pilihan dan dependensi

Rekomendasi inti: **F01, F02, F03, F04, F05, F07, F08, F11, F12, F13,
F15, F16, F20, F21**.

Dependensi wajib kit telah tercakup:

- F01 → tidak ada; F02 → F01; F03 → F01/F02.
- F04/F05/F07/F08/F12/F13/F16 → F01/F02/F03.
- F11 → F01/F02/F03/**F12**.
- F15/F21 → F01/F02.
- F20 → **F04/F05**.

Tidak menggunakan preset utuh: preset arsip menyertakan F06, sedangkan berbagi
akses tidak dipilih untuk tahap awal. Daftar ini adalah rekomendasi peta,
bukan persetujuan memasang 14 modul sekaligus. `selection_confirmed: false`
dan `implementation_authorized: false` pada JSON menjaga batas tersebut.

F06 disimpan sebagai kemungkinan kolaborasi berikutnya.
F09/F10/F14/F17/F18/F19/F22 tidak dipilih untuk cakupan awal. Jika keputusan
masa depan memerlukan modul tersebut, telaah dependensi dan izin dilakukan ulang.

## 6. Urutan pengembangan yang direkomendasikan

| Tahap | Hasil yang dituju | Modul | Prasyarat/batas |
|---|---|---|---|
| **0. Telaah fondasi** | Peta izin, audit, konteks sesi dan sumber data jelas. | F01/F02/F03 | Reuse perbaikan yang masuk; tidak mengubah login atau mengambil tugas antrean. |
| **1. Dokumen dan tenggat** | Pengguna mencatat masa berlaku dan melihat prioritas dokumen. | F04/F05/F20, pengingat lokal terbatas F16/F15 | Bedakan tanggal diketahui, belum diketahui, dan tidak memiliki masa berlaku. Definisikan batas kalender serta ambang “segera habis”; jangan menebak aturan hukum. |
| **2. Workroom privat** | Pekerjaan/checklist, tenggat, keluaran dan review terikat satu kasus. | F11/F12/F03/F15 | Gerbang manusia diikat revisi. Tidak mengaktifkan pembagian data atau status sertifikasi. |
| **3. Bantuan bersumber dan Klinik awal** | Rujukan yang ditelaah, temuan yang dapat ditinjau, dialog kasus dengan konteks pilihan. | F07/F08, SBU-BEDAH/SBU-KLINIK | Ikuti hasil telaah regulasi dan pekerjaan keterlacakan yang sudah berjalan; izin pemrosesan AI eksplisit. |
| **4. Keluaran dan pilot** | Draf dan ringkasan yang konsisten, uji penggunaan nyata dengan cakupan terbatas. | F13/F15/F16 | Jangan mengklaim kelayakan jual dari keberadaan fitur saja. Pilot bukan integrasi Gustafta. |

Tidak memberikan estimasi “bulan 1–4” tanpa penilaian pekerjaan dan kapasitas.
Keamanan, akses lintas akun, konteks respons tertunda, kegagalan dan persistensi
diperiksa pada setiap tahap, bukan ditunda sampai akhir.

## 7. Batas desain yang harus dipertahankan

1. **Satu sumber data:** profil, kasus, bukti dan berkas lokal yang sudah ada;
   tidak membuat tabel kasus/profil atau storage kedua untuk meniru nama Gustafta.
2. **Identitas stabil:** ID kasus bilangan bulat yang ada tetap dapat stabil.
   Dokumen memiliki UUID per versi dan identitas seri; hash isi bukan identitas
   tunggal untuk semua objek. Tidak ada migrasi ID yang diotorisasi oleh peta ini.
3. **Berkas privat:** referensi objek disimpan server, bukan URL bertanda tangan
   yang diperlakukan sebagai alamat permanen. Jangan menampilkan `objectPath`.
4. **Keterikatan kasus:** Ruang Simpan awal bukan arsip umum lintas kasus. Jika
   kelak berkas dipakai banyak kasus, tentukan relasi, kepemilikan versi dan
   konsekuensi penghapusan terlebih dahulu.
5. **Otorisasi:** sesi sah sebagai identitas; pembatasan pemilik untuk setiap
   baca/tulis/unduh/ekspor; konteks permintaan/formulir hanya prasyarat tambahan.
   Cache/response generation tidak boleh membawa data akun atau kasus lain.
6. **AI dan manusia:** menerima temuan AI bukan memverifikasi dokumen atau
   menerbitkan SBU. Perubahan data membutuhkan tindakan dan validasi eksplisit.
7. **Regulasi:** resmi diterbitkan berbeda dari selesai ditelaah untuk aplikasi.
   Gunakan versi, status telaah dan sumber; tidak mengarang persyaratan, masa
   berlaku atau tanggal transisi. Tidak mengambil alih telaah BG001.
8. **Masa berlaku:** `null` tidak boleh sekaligus berarti “tidak berlaku” dan
   “belum diketahui”. AI hanya mengusulkan tanggal sampai pengguna mengonfirmasi.
9. **Kolaborasi:** mode BUJK/pendamping/asesor/LSBU/asosiasi adalah konteks bantuan,
   bukan pemberian kewenangan. Fase awal tetap workspace privat.
10. **Provider:** gunakan AI/storage yang sudah tersedia di SBU. Tidak menyalin
    credential Gustafta atau membuka email/WhatsApp/pembayaran tanpa keputusan.
11. **Retensi/penghapusan:** tindakan destruktif harus menjelaskan dampak pada
    versi, analisis, referensi bukti dan audit; aturan retensi tidak ditebak.

## 8. Dokumen pendamping dan status akhir

- `docs/feature-kit-selection.json`: daftar rekomendasi, dependensi dan batas izin.
- `docs/feature-kit-acceptance.md`: rencana kriteria terima, bukan hasil tes baru.
- Peta ini melengkapi `docs/blueprint-adoption.md` dan `replit.md`, tidak mengganti
  keputusan mandiri maupun catatan audit/telaah yang ada.

**Yang selesai:** pemetaan dokumenter terhadap kit dan kode tujuan yang diperiksa.
**Yang belum dilakukan:** implementasi tambahan, pengujian aplikasi baru,
perubahan konfigurasi, pemindahan data, aktivasi integrasi atau publish.
