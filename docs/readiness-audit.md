# Audit kesiapan jual — tahap 21A

## 1. Identitas, metode, dan batas bukti

- Tanggal: 20 Oktober 2026.
- Basis inspeksi: checkout lokal `5d9f991`, bukan identifikasi build produksi.
  Perubahan setelah basis ini memerlukan penilaian dampak ulang.
- Acuan: `attached_assets/Pasted--Prompt-21-Penyempurnaan-Kesiapan-Jual-QA-SBU-Accelerat_1792453035833.txt`,
  bagian 1–6 dan instruksi 21A; `replit.md`; `docs/blueprint-adoption.md`;
  `docs/feature-kit-mapping.md`; `docs/bg001-bujkn-requirements-draft.md`.
- Metode: inspeksi sumber, struktur skema/migrasi, handler, komponen,
  dokumentasi dan inventaris tes. Melengkapi audit yang sebelumnya
  disampaikan melalui percakapan. Bukan audit keamanan menyeluruh.
- **Tidak menjalankan tes aplikasi, login, query database, pemeriksaan
  produksi, migrasi, integrasi, atau deployment pada audit ini.** Tidak
  membaca nilai Secrets atau data perusahaan. Perubahan hanya dokumen ini.
- Keberadaan kode/tes bukan bukti tes lulus. Hasil historis tidak dipindah
  menjadi hasil QA pada checkout ini. HTTP 401 tanpa sesi, jika pernah
  diamati, tidak membuktikan login atau isolasi sesi berfungsi.

### Definisi status

| Status 21A | Makna dan batas bukti |
| --- | --- |
| Terverifikasi dengan bukti | Hanya untuk perilaku yang tesnya benar-benar dijalankan dengan lingkungan, build, hasil dan bukti tercatat. **Tidak diberikan pada fitur mana pun oleh audit ini.** |
| Ada tetapi belum diuji | Implementasi terbukti ada pada berkas yang disebut; perilaku runtime, kelengkapan spesifikasi dan produksi belum terverifikasi pada audit ini. |
| Belum ada | Kemampuan spesifik tidak ditemukan pada area sumber yang diinspeksi; bukan kesimpulan dari halaman publik/login atau klaim seluruh sistem eksternal tidak memilikinya. |
| Tidak termasuk rilis | Batas rilis yang diusulkan, bukan klaim implementasi. Perlu persetujuan pemilik sebelum dianggap cakupan final. |

“Terbukti — implementasi” dalam laporan sebelumnya setara dengan adanya kode,
bukan “Terverifikasi” secara fungsional di register ini. Implementasi parsial
dan gap dicatat dalam baris yang sama agar tidak menyatakan seluruh modul hilang.

## 2. Stack, dependensi dan jalur perubahan

React/Vite + TypeScript pada `artifacts/gustafta-sbu`, Express pada
`artifacts/api-server`, PostgreSQL/Drizzle pada `lib/db`, kontrak OpenAPI
`lib/api-spec/openapi.yaml`, klien hasil Orval pada `lib/api-client-react`.
`package.json` akar memakai pnpm workspace dan TypeScript project references.
Autentikasi menggunakan Clerk; sesi server adalah sumber identitas, bukan
peran profil atau header pemilik formulir.

- Entry router: `artifacts/api-server/src/routes/index.ts`; handler utama
  `routes/sbu.ts`; endpoint berikut memakai awalan `/api`.
- Skema: `lib/db/src/schema/{sbu,workspace,standalone,personnel,workroom,workroom-reviews,consultations,chat-quota}.ts`.
- Migrasi SQL tambahan: `lib/db/migrations/`; pelaksana
  `lib/db/migrate-workspace.mjs`. Kehadiran SQL tidak membuktikan diterapkan
  pada database mana pun.
- `scripts/post-merge.sh` melakukan instalasi, codegen, **db push**, dan
  `migrate:workspace`. Jangan menjalankannya sebagai alat audit read-only
  atau bukti penyegaran tipe tanpa menyadari efek database.
- Startup, penyimpanan privat, pemindai lokal, layanan AI, dan Clerk adalah
  dependensi operasional. Kredensial, biaya aktual, readiness signature
  pemindai, konfigurasi edge/login produksi dan pemulihan cadangan tidak
  diperiksa di sini. Jangan mengganti auth atau memperluas trusted proxy
  sebagai bagian audit.

## 3. Inventaris spesifik repo dan pencocokan bagian 1–6

Semua baris “Ada” di bawah **Ada tetapi belum diuji** pada audit ini.

| Kemampuan / spesifikasi | Kondisi dan bukti implementasi | Gap atau batas |
| --- | --- | --- |
| Profil, onboarding, kasus, dashboard (§1, §3) | Ada: `src/App.tsx`, `routes/sbu.ts`, `schema/sbu.ts`; GET/PATCH `/me`, CRUD `/cases`, GET `/dashboard`. | Kualifikasi formulir masih kecil/menengah/besar dan klasifikasi teks; bukan master seluruh kombinasi bentuk usaha/subklasifikasi yang disahkan. |
| Identitas dan pemisahan data (§5) | Ada: `sbu.ts` memakai `getAuth`, `owner_id`, precondition `X-SBU-Form-Owner`; `lib/workspace-context.ts`; `schema/workspace.ts`. | Ruang kerja/wadah pribadi bukan organisasi terverifikasi. Tidak ada kewenangan tim hanya karena memilih peran. Isolasi lintas akun perlu QA09; multi-klien kolaboratif belum tersedia. |
| Login dan domain (§5) | Ada: `middlewares/clerkRequestOrigin.ts`, `clerkProxyMiddleware.ts`, boundary sesi pada frontend. | Kebenaran konfigurasi/provenance edge dan perjalanan login produksi belum diverifikasi. Pada `sbu.ts`, penolakan `requireAuth` terjadi sebelum middleware no-store; kebijakan respons privat perlu diuji, bukan disamakan dengan login berhasil. |
| Deklarasi bukti (§3.2) | Ada: `/cases/:id/evidence`, `schema/sbu.ts`, `components/case-evidence.tsx`. | Status catatan tidak sama dengan sah, memenuhi, atau ditelaah ahli. Model empat status evaluasi dan status bukti terpisah sebagaimana kontrak baru belum lengkap. |
| Ruang Simpan (§3.2, §5) | Ada: `routes/standalone.ts`, `document-vault.ts`, `lib/document-storage.ts`, `schema/standalone.ts`, `components/document-vault-page.tsx`, `case-documents.tsx`; dokumen privat terkait kasus, versi, otorisasi, scan/karantina. | Bukan drive bersama lintas akun. Tidak otomatis menjadi deklarasi atau pemenuhan. Kontrol file, akses unduh, expiry dan karantina perlu bukti uji aktual. Versi berkas bukan pengganti backup/restore. |
| Bedah Dokumen (§5, QA15) | Ada: `routes/document-analysis.ts`, `document-analysis-pages.ts`, `components/document-analysis-panel.tsx`; persetujuan, versi sumber dan halaman terpilih. | Bantuan AI, bukan autentikasi bukti atau evaluator hukum. Batas proses lokal belum membuktikan pembatasan lintas instance; perlu pengujian instruksi manipulatif dan biaya. |
| Personel & SKK (§3) | Ada: `routes/personnel.ts`, `schema/personnel.ts`, `components/personnel-page.tsx` dan komponen detail/form. | Pencatatan sertifikat/tanggal bukan validasi resmi, matcher jabatan/jenjang, atau pembuktian tidak rangkap perusahaan. Pengingat visual bukan pengiriman notifikasi. |
| Evaluator (§3.1–3.2) | Ada: `lib/sbu-rules.ts`, GET `/cases/:id/assessment`; lima kategori awal berdasar keberadaan kode bukti, tambahan SMAP/transisi, `recordedCount/requiredCount`. | Bukan pemeriksaan seluruh syarat substantif. Hasil kini `perlu_bukti` atau `perlu_tinjauan`, **bukan siap/lulus**. Tidak ditemukan manifest cakupan tertelaah, evaluator rule-set operasional berversi penuh, atau skor kesiapan substantif sesuai kontrak baru. |
| Sumber dan pemicu transisi (§3.1) | Ada: `sbu-rules.ts`, `/regulations`, GET/PUT `/transition-verifications`; allowlist penelaah server, verifikasi sumber dan persetujuan ahli membatasi tanggal. | Kontrol ini spesifik alur transisi, bukan pengesahan seluruh persyaratan. Draf BG001 tidak menjadi master aktif. G1–G2 masih perlu telaah penerapan; jangan menolak perpanjangan otomatis. |
| Temuan dan tindakan (§3.3) | Ada parsial: `components/case-action-plan.tsx`; `routes/workroom.ts`, `schema/workroom.ts`, `components/case-workroom.tsx`; GET/POST `/cases/:id/workroom`, PATCH/DELETE item. | Checklist/tindak lanjut/jurnal tersedia; `assignee` teks dan `dueOn` target internal tidak memberi akses. Belum ditemukan hubungan temuan–rule-version–bukti penyelesaian dan generator tindakan idempoten lengkap. Jangan membuat Workroom kedua. |
| Persetujuan internal (§3.2, §4) | Ada: `routes/workroom-reviews.ts`, `lib/workroom-review-materials.ts`, `schema/workroom-reviews.ts`, `components/case-workroom-reviews.tsx`; daftar, preview dan simpan `/cases/:id/workroom/reviews`. | Snapshot/version conflict dan currentness bahan terpilih bukan sistem persetujuan ahli lintas akun. Riwayat ini bukan arsip audit permanen; penghapusan kasus menghapus riwayat terkait. Perubahan aturan belum tercakup sebagai invalidasi seluruh laporan. |
| Asisten dan Klinik (§4) | Ada: `routes/sbu-chat.ts`, `consultations.ts`, `schema/consultations.ts`, `components/sbu-chat-page.tsx`, `consultations-page.tsx`; `/openai/sbu/messages`, `/consultations` dan pesan sesi. | Klinik percakapan AI privat bukan pemesanan jasa ahli manusia. Konteks dikirim dengan persetujuan; jawaban tidak memberi kewenangan mengubah kasus. |
| Kutipan dan biaya AI (§3, §5) | Ada parsial: `lib/sbu-chat-retrieval.ts` berisi korpus kurasi kecil (empat entri) dan validasi referensi; `sbu-chat-quota.ts`, `schema/chat-quota.ts`, endpoint kuota Asisten. | Bukan RAG lengkap seluruh lampiran. Validasi ID kutipan bukan jaminan kebenaran semantik jawaban. Kuota bersama Asisten tidak membuktikan anggaran gabungan Klinik/Bedah; keduanya masih memiliki pembatas proses lokal. |
| Laporan (§3.4) | Ada parsial: GET `/cases/:id/preparation-summary`, `lib/preparation-summary.ts`, `components/case-preparation-export.tsx`; snapshot baca konsisten, escaping/CSP, unduh HTML, cetak native/Save as PDF browser. | Bukan generator PDF server terpisah. Ringkasan kini kategori/jumlah catatan, temuan dan sumber; belum laporan lengkap bernomor dengan manifest, versi evaluasi, tindakan/PIC dan catatan ahli tersimpan. Data personel dan seluruh Workroom tidak otomatis masuk. Jangan mengekspor isi privat tambahan tanpa pilihan/otorisasi. |
| Landing dan penawaran (§4) | Ada halaman publik dan disclaimer pada frontend. | Dalam UI/rute/skema yang diinspeksi, belum ditemukan alur order telaah ahli, harga/SLA disetujui, pembayaran/webhook, atau halaman legal lengkap. Tidak menyimpulkan ketiadaan dari halaman login. Contoh laporan publik tersamar perlu disiapkan. |
| Order, penugasan ahli, pencabutan (§4–5) | **Belum ada** untuk kontrak layanan manusia lintas akun pada sumber yang diperiksa. | Memerlukan otorisasi penugasan, persetujuan lingkup/biaya/akses berversi, expiry/revocation dan audit. Role profil tidak boleh dijadikan jalan pintas. |
| Audit, retensi dan pemulihan (§5) | Ada audit CRUD dalam fondasi workspace dan snapshot review; ada lifecycle pembersihan berkas. | Audit akses/unduh/layanan menyeluruh, kebijakan retensi legal, ekspor/penghapusan akun, backup privat dan restore teruji **belum terverifikasi**. Pembersihan objek yatim bukan kebijakan retensi pelanggan atau backup. |
| Integrasi dan skala (§4, §2 P3) | `routes/retired-integrations.ts`, dokumentasi penghentian pada `replit.md`; konsep Gustafta hanya referensi. | **Tidak termasuk rilis usulan:** integrasi Gustafta/OSS/SIJK/E-SIMPAN, multi-klien kolaboratif, white-label, WhatsApp, agen otonom. Jangan mengaktifkannya atau mengklaim sinkronisasi. |

## 4. Konflik prompt lama dan pengaman hasil

| Konflik yang diperiksa | Temuan berbasis kode / keputusan audit |
| --- | --- |
| Kualifikasi universal | Form saat ini memakai tiga label umum; jangan dianggap K1/K2/K3 atau skema konsultansi. Master per cakupan dan konfirmasi data ambigu diperlukan; tidak backfill otomatis. |
| Draf masuk skor | Tidak ditemukan pemuatan draf Markdown BG001 sebagai aturan runtime. Namun evaluator statis belum merupakan rule engine berversi yang disahkan; jangan memasarkan seluruh norma sudah dimodelkan. |
| Nol aturan menghasilkan siap/100% | Tidak ditemukan perilaku “siap” tersebut pada `assessCase`: status tetap perlu bukti/tinjauan dan pemeriksaan awal tetap ada. Ini bukan bukti QA01 lulus pada manifest baru yang belum diimplementasikan. |
| Tugas selesai dianggap memenuhi | Workroom menyimpan tugas, evaluator membaca bukti; tidak ditemukan penggabungan otomatis status tugas menjadi pemenuhan syarat. Integrasi berikutnya harus mempertahankan pemisahan ini. |
| AI memberi skor sendiri | Penilaian persiapan kini berasal dari kode, bukan output LLM. Percakapan AI tetap dapat mengandung pernyataan keliru; perlu QA15 dan batas klaim, bukan menerima skor teks sebagai state. |
| Peran memberi akses lintas tenant | Kepemilikan bersumber sesi, bukan label peran; belum ada konsultan multi-klien yang boleh dipasarkan sebagai tersedia. QA09/10 tetap diperlukan. |
| Integrasi Gustafta diwajibkan | Bagian 4 Prompt 21 bersifat kondisional dan tidak mengesampingkan pembatalan integrasi. Reuse Klinik/Workroom internal SBU, bukan membuat modul duplikat atau menghidupkan adaptor. |
| Framework 2.0 menyatakan belum ada unggah | Bertentangan dengan kode vault saat ini. Tingkatkan ekstraksi/konsistensi bila disetujui; jangan membangun ulang storage. |

## 5. Risiko prioritas dan dependensi

Prioritas ini adalah rencana, bukan perubahan yang telah dilakukan.
Risiko tidak serta-merta membuktikan insiden atau kebocoran telah terjadi.

| ID | Prioritas | Risiko / bukti gap | Perubahan aman dan dependensi |
| --- | --- | --- | --- |
| R01 | P0 | Ketersediaan kategori bukti dipasarkan sebagai kelayakan substantif; `sbu-rules.ts` belum memodelkan seluruh syarat. | Batasi klaim; manifest cakupan yang disahkan, status belum dapat disimpulkan, kurasi vs operasional terpisah. Bergantung sumber dan reviewer, bukan AI. |
| R02 | P0 | Data lama kecil/menengah/besar, klasifikasi teks, G1–G2 belum disahkan. | Konfirmasi pemetaan per kasus; draf tidak aktif; jangan menolak/menaikkan kualifikasi atau mengubah kasus lama. |
| R03 | P0 | Kontrol kepemilikan ada tetapi QA negatif/login produksi belum dibuktikan dalam audit. | Uji sintetis seluruh baca/mutasi/ekspor/unduh, perubahan sesi, cache error dan URL akses; jangan memperlebar trusted proxy tanpa bukti. |
| R04 | P0 | Restore cadangan dan kebijakan data belum terbukti; versi dokumen bukan backup. | Runbook dan restore di lingkungan terisolasi, mencakup hubungan DB–objek; persetujuan retensi/privacy. Tidak memulihkan ke produksi saat uji. |
| R05 | P1 | Laporan belum memuat keseluruhan kontrak hasil bagian 3.4. | Reuse ringkasan/print, snapshot evaluasi konsisten, nomor/lingkup/versi, penghambat, tindakan/PIC, sumber dan batas; contoh DATA CONTOH. Jangan duplikasi mesin ekspor. |
| R06 | P1 | Temuan belum terhubung ke tindakan idempoten berversi. | Reuse Workroom; kunci stabil untuk hasil evaluator dan hubungan tindakan, penyelesaian tidak mengesahkan syarat. |
| R07 | P1 | Tinjauan internal dapat disalahpahami sebagai Telaah Ahli; order/izin belum ada. | Label terpisah. Jika layanan ditawarkan, desain order, penugasan dan persetujuan akses server-side; jangan otomatis membuka akses reviewer. |
| R08 | P1 | Harga, SLA, legal dan contoh belum memenuhi kontrak penawaran. | Persetujuan pemilik, “Minta penawaran” saat nilai belum ditetapkan; identitas pengelola/kontak nyata, bukan template final palsu. |
| R09 | P2 | Kuota Asisten tidak melindungi seluruh biaya AI lintas modul/instance. | Anggaran dan admission control lintas modul perlu desain tersendiri; kuota bukan batas biaya rupiah absolut. Pekerjaan Bedah lintas proses sudah antre, jangan diduplikasi. |
| R10 | P2 | Pemantauan pasca-terbit dan notifikasi legal belum tersedia lengkap. | Mulai dari tanggal terkonfirmasi dan pekerjaan idempoten; bukan perpanjangan NIB tahunan universal. |
| R11 | P3 | Skala multi-klien/white-label memperluas model akses. | Tunda sampai manfaat pilot dan model akses terbukti. Bukan mengubah peran profil menjadi otorisasi. |

## 6. Register QA01–QA16

Ini **spesifikasi pemeriksaan, bukan hasil eksekusi**. Build pelaksanaan,
lingkungan, penguji dan tanggal dibiarkan “—” sampai benar-benar dijalankan.
Basis inspeksi di bagian 1 tidak menggantikan build yang diuji.

| ID | Modul / skenario | Hasil diharapkan | Lingkungan | Build/commit uji | Hasil aktual | Status | Bukti/log tersamar | Penguji | Tanggal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA01 | Evaluator: nol aturan/manifest belum lengkap | Belum dapat disimpulkan; tidak 100%/siap | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA02 | Aturan draf/pemicu belum pasti | Tidak menjadi keputusan siap; perlu konfirmasi | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA03 | Skor tinggi, satu syarat kritis gagal | Penghambat tetap terlihat; paket siap ajukan terkunci | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA04 | Master konsultansi/konstruksi; data lama Kecil | Pilihan sesuai master tertelaah; nilai ambigu tidak ditebak | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA05 | Deklarasi/unggah tanpa telaah | Tidak diberi label resmi/ditelaah ahli | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA06 | Bukti kedaluwarsa/input wajib kosong | Syarat terkait tidak dianggap memenuhi | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA07 | Hitung ulang dua kali/tugas ditutup manual | Deterministik, tidak duplikat, syarat tidak otomatis lolos | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA08 | Aturan/bukti berubah setelah telaah | Hasil lama usang, perlu telaah ulang; snapshot historis utuh | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA09 | Akun/klien B membaca/mengubah/mengunduh objek A | Ditolak tanpa data/metadata sensitif bocor | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA10 | Ahli tidak ditugaskan/persetujuan dicabut | Ditolak sesuai masa/lingkup; audit tersedia | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA11 | Ekspor kasus belum lengkap/contoh publik | Kekurangan bisa diekspor; snapshot konsisten; contoh tersamar | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA12 | Webhook palsu/ganda; URL sukses checkout palsu | Tidak memberi akses; event valid ganda tidak menggandakan order | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA13 | Klinik/Workroom tidak tersedia | Fallback operator jelas; tidak ada sukses/sinkronisasi palsu | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA14 | Ekspor/penghapusan/restore cadangan | Otorisasi diperiksa; hasil restore terdokumentasi | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA15 | Dokumen berisi instruksi manipulatif ke AI | Tidak mengubah rule/status, mengakses akun lain atau mengekspor data | — | — | Belum dieksekusi | Belum diuji | — | — | — |
| QA16 | Pengguna baru pada mobile, alur penuh | Kasus → temuan → tindakan → laporan → permintaan telaah selesai | — | — | Belum dieksekusi | Belum diuji | — | — | — |

QA04 tidak menuntut membuka konsultansi jika dikecualikan dari pilot,
tetapi wajib menguji bahwa kasus di luar cakupan tidak dianggap didukung.
QA10/12 tidak otomatis “tidak relevan”: keputusan rilis harus menjelaskan
apakah layanan ahli/checkout dikecualikan dan bagaimana jalur manual bekerja.
Jangan membuat endpoint dummy untuk melewati QA.

### Bahan uji yang sudah ada, belum dijalankan ulang

- API/PG: `artifacts/api-server/test/sbu-assessment-route.test.mjs`,
  `sbu-case-postgres.test.mjs`, `sbu-dashboard-postgres.test.mjs`,
  `sbu-profile-postgres.test.mjs`, `workroom-reviews-postgres.test.mjs`,
  `standalone-documents-postgres.test.mjs`, `consultations-postgres.test.mjs`,
  `personnel-postgres.test.mjs`, `sbu-chat-route.test.mjs`.
- Dokumen: `document-validation.test.mjs`, `document-malware.test.mjs`,
  `document-analysis-pages.test.mjs`, `document-cleanup.test.mjs` pada
  direktori tes API yang sama.
- Komponen: `artifacts/gustafta-sbu/src/components/case-action-plan.test.tsx`,
  `case-evidence.test.tsx`, `case-preparation-export.test.tsx`,
  `document-analysis-panel.test.tsx`, `profile-form.test.tsx`.
- Gunakan helper PostgreSQL terbatas dan data sintetis, bukan koneksi tulis
  administrator ke tabel public. Tes lama dipetakan ke QA hanya setelah
  memeriksa assertion, menjalankan, dan mencatat hasilnya.

## 7. Rencana perubahan aman untuk persetujuan sebelum 21B

### Cakupan pilot yang diusulkan, belum disetujui

Produk: **Pemeriksaan Kesiapan SBU + Laporan Tindakan Perbaikan**.
Satu pemilik akun mengelola kasusnya; bukan layanan kolaboratif multi-klien.
BG001 BUJKN menjadi kandidat cakupan awal **hanya setelah** manifest,
sumber, penerapan operasional dan reviewer disetujui. Selama belum lengkap,
produk sebatas pencatatan/persiapan awal dengan hasil belum dapat disimpulkan;
audit ini tidak mengesahkan pilot penilaian berbayar.

Tidak memasukkan otomatisasi OSS/SIJK, integrasi Gustafta, simulator seluruh
subklasifikasi, GT001, PMA/asing, white-label, atau banyak agen. Telaah manusia
boleh dikelola operator setelah izin akses dan perjanjian jelas; pembayaran
manual boleh bila order/aktivasi operator tercatat. Tidak mengarang harga,
SLA, testimoni atau klaim lima pelanggan telah tercapai.

### Urutan 21B: hasil dahulu, bukan pembangunan ulang

1. Tetapkan cakupan/master dan persetujuan manusia. Pertahankan draf BG001
   sebagai draf; pertanyaan G1–G2 tidak diputuskan oleh pengembang/LLM.
2. Reuse evaluator; tambahkan manifest dan aturan berversi dengan status
   kurasi/operasional terpisah. Default tanpa persetujuan: tidak aktif.
   Tambahkan status belum dapat disimpulkan dan penghambat terpisah dari skor.
3. Reuse bukti/Workroom: tautkan temuan dan tindakan tanpa menyamakan status
   tugas dengan pemenuhan. Evaluasi ulang tidak menggandakan tindakan.
4. Reuse preview/snapshot review dan ekspor: versi evaluasi/input/aturan,
   stale detection, laporan mandiri berbeda dari label ahli.
5. Jalankan QA01–08/11 pada fixture terpisah, catat bukti. Hasil uji tidak
   mengesahkan hukum. Hentikan sebelum 21C/21D tanpa keputusan lanjutan.

### Migrasi aditif yang diusulkan (desain, belum SQL final)

- Tambah penyimpanan manifest/rule-version, persetujuan kurasi dan penerapan,
  sumber/locator dan cakupan; referensi revisi eksplisit pada hasil evaluasi.
- Tambah snapshot hasil/temuan historis, hubungan tindakan ke temuan dengan
  kunci idempotensi, serta metadata laporan. Jangan menimpa snapshot review
  yang sudah disimpan atau menambah data privat ke laporan tanpa dasar akses.
- Gunakan kolom/tabel baru nullable atau default aman; tidak rename/drop
  tabel aktif, tidak mengganti owner/client, tidak mengonversi “Kecil” menjadi
  K1. Data lama tetap utuh dan ditandai perlu konfirmasi bila diperlukan.
- Perubahan OpenAPI diikuti codegen, deklarasi library dan pemeriksaan
  kompatibilitas. Backfill, bila dibutuhkan, hanya metadata yang dapat
  dibuktikan, terpisah dan dapat diulang; bukan interpretasi kasus lama.
- Order/penugasan/persetujuan ahli dan pembayaran adalah desain 21C,
  bukan tambahan tersembunyi pada migrasi 21B.

### Rollback dan gerbang

- Sebelum perubahan database: inventaris dependensi dan cadangan DB/objek
  privat; buktikan restore di lingkungan uji, bukan pada data pelanggan.
- Aktivasi evaluator baru di belakang pengaturan nonaktif bawaan, setelah
  persetujuan manusia dan QA. Sediakan cara menghentikan evaluasi baru tanpa
  menghapus data atau mengaktifkan ulang adaptor Gustafta.
- Rollback aplikasi ke versi kompatibel dengan skema aditif; pertahankan
  hasil baru sebagai histori berlabel, jangan jalankan DROP/destructive down
  migration. Uji kompatibilitas versi lama sebelum rilis.
- Jika hasil evaluasi diragukan: hentikan klaim siap, tandai perlu telaah,
  pertahankan snapshot historis dan keterlacakan sumber. Jangan mengubah
  kasus pengguna diam-diam atau menyajikan evaluator lama sebagai memenuhi
  kontrak penilaian substantif.
- Rilis hanya setelah QA relevan lulus, risiko P0 ditutup, cakupan/sumber
  ditelaah, legal/layanan/harga disetujui, dan pemilik menyetujui publikasi.
  Audit 21A tidak memberi izin deployment.

## 8. Kesimpulan dan batas serah terima

Fondasi produk telah diimplementasikan cukup luas; membangun ulang vault,
Klinik atau Workroom tidak beralasan dari bukti kode. Gap utama adalah
**kontrak evaluasi yang lengkap dan tertelaah, hubungan temuan–tindakan,
laporan hasil layanan, tata kelola ahli, dan bukti pengujian/pemulihan**.

Audit kode/dokumentasi ini selesai sebagai tahap 21A, bukan kelulusan QA,
keamanan menyeluruh atau verifikasi produksi. Kelayakan pilot berbayar belum
dinyatakan lulus. Tunggu persetujuan rencana/cakupan sebelum 21B; jangan
mengambil alih tugas antrean, mengaktifkan aturan draf, atau menerbitkan aplikasi.
