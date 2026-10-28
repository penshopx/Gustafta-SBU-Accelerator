/** Product help only: curated operating instructions, never user data or legal inference. */
export type HelpLink = { label: string; path: string; requiresLogin?: boolean };
export type HelpAnswer = {
  topic: string; title: string; summary: string; steps: string[];
  links: HelpLink[]; related: string[]; source: string; matched: boolean;
};
type Topic = Omit<HelpAnswer, 'topic' | 'matched'> & { id: string; keywords: string[] };
const privateLink = (label: string, path: string): HelpLink => ({ label, path, requiresLogin: true });
const publicLink = (label: string, path: string): HelpLink => ({ label, path });
const userSource = (chapter: string) => `Panduan User · ${chapter}`;
export const HELP_QUICK_QUESTIONS = [
  'Bagaimana mulai menggunakan aplikasi?',
  'Bagaimana membuat kasus SBU?',
  'Bagaimana unggah dokumen?',
  'Bagaimana menggunakan Asisten AI?',
  'Bagaimana memakai Pakar Skema BG dan BS?',
  'Mengapa simpan atau chat gagal?',
];

const topics: Topic[] = [
  {
    id: 'start', title: 'Mulai dari satu kasus yang jelas',
    keywords: ['mulai menggunakan', 'mulai dari mana', 'cara menggunakan aplikasi', 'fitur aplikasi', 'panduan aplikasi', 'apa itu gustafta', 'bantuan', 'help desk', 'menu aplikasi'],
    summary: 'Aplikasi membantu menyiapkan bahan SBU, memahami sumber dan mengelola tindak lanjut. Bukan penerbit sertifikat atau pengirim permohonan otomatis ke LSBU/OSS.',
    steps: ['Masuk atau daftar, lalu lengkapi profil dan pilih peran sesuai kegiatan Anda.', 'Untuk akun dengan ruang kasus, buat kasus permohonan baru atau perpanjangan.', 'Simpan dokumen, catat deklarasi bukti dan personel/SKK, lalu baca temuan persiapan.', 'Gunakan sumber regulasi atau Asisten peran untuk pemahaman; catat tindak lanjut dan siapkan ringkasan.'],
    links: [publicLink('Masuk', '/sign-in'), publicLink('Coba Simulator SBU', '/simulator')],
    related: ['Bagaimana membuat kasus SBU?', 'Apa beda Admin dan User?'], source: userSource('01 / Mulai di sini'),
  },
  {
    id: 'account', title: 'Masuk, daftar dan periksa akun',
    keywords: ['login', 'log in', 'masuk akun', 'daftar akun', 'buat akun', 'kata sandi', 'password', 'otp', 'kode verifikasi', 'keluar akun', 'logout', 'lupa sandi'],
    summary: 'Gunakan metode masuk/pemulihan yang tersedia di halaman autentikasi. Jangan menulis kata sandi, kode verifikasi atau cookie di Help Desk.',
    steps: ['Buka Masuk atau Daftar dan ikuti pilihan yang ditampilkan.', 'Lengkapi profil ketika diminta. Metode pemulihan akun mengikuti fasilitas pada formulir autentikasi.', 'Jika sesi berubah atau berakhir, pastikan akun benar lalu masuk ulang; jangan meneruskan formulir akun lama.', 'Pilih Keluar akun dari navigasi setelah memakai perangkat bersama.'],
    links: [publicLink('Masuk', '/sign-in'), publicLink('Daftar', '/sign-up')],
    related: ['Bagaimana mengubah profil?', 'Mengapa menu Kasus SBU tidak muncul?'], source: userSource('02 / Akun dan navigasi'),
  },
  {
    id: 'profile', title: 'Profil pengguna berbeda dari profil perusahaan',
    keywords: ['ubah profil', 'mengubah profil', 'nama pengguna', 'profil akun', 'pengaturan', 'organisasi', 'profil perusahaan', 'data perusahaan'],
    summary: 'Pengaturan mengelola profil pengguna/peran. Profil perusahaan menyimpan data badan usaha yang Anda deklarasikan, privat pada akun dan tidak terverifikasi otomatis.',
    steps: ['Buka Pengaturan untuk memperbarui identitas dan peran pengguna.', 'Untuk data badan usaha, buka Profil perusahaan.', 'Isi atau perbaiki formulir, simpan, lalu tunggu konfirmasi berhasil.', 'Periksa kembali data tersimpan; perubahan profil tidak memberikan akses ke akun lain.'],
    links: [privateLink('Pengaturan', '/settings'), privateLink('Profil perusahaan', '/company-profile')],
    related: ['Apa beda Admin dan User?', 'Mengapa simpan atau chat gagal?'], source: userSource('02 / Akun dan profil perusahaan'),
  },
  {
    id: 'case', title: 'Buat kasus permohonan baru atau perpanjangan',
    keywords: ['buat kasus', 'membuat kasus', 'kasus baru', 'kasus sbu', 'permohonan baru', 'perpanjangan', 'status permohonan', 'hapus kasus', 'ubah kasus'],
    summary: 'Kasus mengelompokkan catatan persiapan pada akun Anda. Status aplikasi bukan status resmi permohonan LSBU/OSS.',
    steps: ['Buka Kasus SBU lalu pilih Kasus baru.', 'Isi nama badan usaha, pilih permohonan baru/perpanjangan dan lengkapi konteks yang diminta.', 'Untuk perpanjangan, cocokkan informasi sertifikat dan tanggal berakhir dengan dokumen asli.', 'Simpan lalu buka detail kasus untuk mencatat bukti, dokumen dan tindak lanjut.', 'Penghapusan kasus bersifat permanen. Kasus yang masih memiliki dokumen asli harus ditangani sesuai pesan aplikasi sebelum dapat dihapus.'],
    links: [privateLink('Kasus SBU', '/cases')],
    related: ['Bagaimana unggah dokumen?', 'Bagaimana mencatat bukti?'], source: userSource('03 / Kasus SBU'),
  },
  {
    id: 'evidence', title: 'Catat bukti, lalu baca temuan persiapan',
    keywords: ['deklarasi bukti', 'catatan bukti', 'catat bukti', 'mencatat bukti', 'tambah bukti', 'penilaian awal', 'temuan persiapan', 'penilaian kasus'],
    summary: 'Deklarasi bukti adalah informasi yang Anda nyatakan. Penilaian awal hanya membaca aturan yang didukung, bukan mengesahkan berkas atau menyatakan pasti lolos.',
    steps: ['Buka Kasus SBU dan pilih kasus yang benar.', 'Pilih tab Deklarasi bukti, lalu Catat bukti/tindakan tambah yang tersedia.', 'Isi kategori, fakta, tanggal dan rujukan yang dapat ditelusuri; simpan lalu periksa kartunya.', 'Buka Penilaian awal. Jadikan temuan sebagai bahan pemeriksaan manusia dan tindak lanjut di ruang kerja.'],
    links: [privateLink('Buka daftar kasus', '/cases')],
    related: ['Bagaimana menggunakan ruang kerja kasus?', 'Bagaimana unduh ringkasan persiapan?'], source: userSource('04 / Deklarasi bukti'),
  },
  {
    id: 'vault', title: 'Unggah melalui Ruang Simpan',
    keywords: ['ruang simpan', 'upload', 'unggah', 'unggahan', 'upload dokumen', 'simpan dokumen', 'menyimpan dokumen', 'unggah dokumen', 'unduh dokumen', 'hapus dokumen', 'penyimpanan berkas'],
    summary: 'Ruang Simpan menyimpan berkas privat sesuai kepemilikan akun. Ini penyimpanan mandiri, bukan koneksi otomatis ke Gustafta eksternal.',
    steps: ['Buka Ruang Simpan lalu Dokumen baru.', 'Pilih Kasus tujuan milik akun Anda; buat kasus dahulu bila belum ada.', 'Lengkapi kategori/nama dan pilih berkas sesuai format serta ukuran yang ditampilkan.', 'Tunggu penyelesaian unggahan dan pemindaian; periksa status siap sebelum memakai berkas.', 'Gunakan filter kasus/kategori. Hapus hanya bila yakin: penghapusan permanen juga memengaruhi analisis versi terkait.'],
    links: [privateLink('Ruang Simpan', '/documents')],
    related: ['Bagaimana menjalankan Bedah Dokumen?', 'Bagaimana berdialog tentang dokumen saya?'], source: userSource('05 / Ruang Simpan'),
  },
  {
    id: 'analysis', title: 'Pratinjau dahulu, baru setujui Bedah Dokumen',
    keywords: ['bedah dokumen', 'analisis dokumen', 'analisa dokumen', 'menjalankan bedah', 'halaman terpilih', 'pratinjau', '4 mib', '10 halaman', 'hasil analisis'],
    summary: 'Bedah Dokumen menganalisis halaman yang dipilih dengan persetujuan. Help Desk ini tidak membuka dokumen atau menjalankan analisis untuk Anda.',
    steps: ['Buka dokumen yang sudah siap/bersih pada Ruang Simpan atau kasus terkait.', 'Buka panel Bedah Dokumen, periksa kasus, dokumen dan versinya.', 'Pilih halaman lalu tinjau pratinjau; ikuti batas maksimal 10 halaman dan 4 MiB yang ditampilkan.', 'Baca pemberitahuan dan berikan persetujuan sebelum menjalankan analisis AI.', 'Cocokkan hasil dengan berkas asli. Perubahan halaman/versi memerlukan pratinjau dan persetujuan baru.'],
    links: [privateLink('Ruang Simpan', '/documents')],
    related: ['Bagaimana berdialog tentang dokumen saya?', 'Mengapa simpan atau chat gagal?'], source: userSource('06 / Bedah Dokumen'),
  },
  {
    id: 'document-chat', title: 'Asisten Dokumen memakai cuplikan yang disetujui',
    keywords: ['asisten dokumen', 'chat dokumen', 'dialog dokumen', 'berdialog tentang dokumen', 'bertanya tentang file', 'dokumen saya', 'cuplikan'],
    summary: 'Dialog membahas cuplikan hasil analisis yang Anda pilih, bukan seluruh berkas atau seluruh Ruang Simpan secara otomatis.',
    steps: ['Buka Ruang Simpan dan pilih Asisten Dokumen pada dokumen siap/bersih yang benar.', 'Pilih hasil analisis yang cocok dengan kasus, dokumen dan versi. Jalankan Bedah Dokumen dahulu jika belum ada.', 'Tinjau cuplikan/referensi dan berikan persetujuan cuplikan serta chat secara terpisah.', 'Ajukan pertanyaan yang sesuai cuplikan. Chat ini bukan verifikasi keaslian.', 'Percakapan sementara dapat berakhir saat memuat ulang atau berpindah akun/halaman. Catat hasil penting melalui sarana yang sesuai.'],
    links: [privateLink('Ruang Simpan', '/documents')],
    related: ['Bagaimana menjalankan Bedah Dokumen?', 'Bagaimana menggunakan Asisten AI?'], source: userSource('06 / Dialog dokumen'),
  },
  {
    id: 'assistant', title: 'Pilih tujuan percakapan di Asisten peran',
    keywords: ['asisten ai', 'asisten peran', 'cara chat', 'menggunakan asisten', 'tutor regulasi', 'pemeriksa dokumen', 'studi kasus', 'pendamping proses', 'mode chat', 'claude'],
    summary: 'Asisten peran membantu memahami konteks SBU. Help Desk hanya memberi petunjuk pengoperasiannya dan tidak memakai kuota chat AI Anda.',
    steps: ['Buka Asisten peran, lalu pilih sudut pandang, tujuan dan spesialis yang tersedia.', 'Tujuan meliputi Tutor Regulasi, Panduan Permohonan Baru, Panduan Perpanjangan, Pemeriksa Dokumen, Pakar Studi Kasus dan Pendamping Proses.', 'Isi pertanyaan dengan konteks minimum, baca pemberitahuan lalu setujui pemrosesan AI bila berwenang.', 'Periksa kuota/anggaran, kirim dan baca kartu sumber serta batas verifikasi pada jawaban.', 'Perubahan konteks dengan draf/riwayat meminta konfirmasi; persetujuan ulang mungkin diperlukan.'],
    links: [privateLink('Asisten peran', '/assistant')],
    related: ['Bagaimana memakai Pakar Skema BG dan BS?', 'Mengapa tombol kirim chat tidak aktif?'], source: userSource('07 / Asisten peran'),
  },
  {
    id: 'scheme', title: 'Gunakan pilot Pakar Skema BG atau BS',
    keywords: ['pakar skema', 'skema bg', 'skema bs', 'bg dan bs', 'klasifikasi', 'subklasifikasi', 'kbli', 'bg001', 'bs001', 'bs017', 'bs018', 'bs020'],
    summary: 'Pilot mendukung BG001–BG009 dan BS001–BS020 untuk pemetaan KBLI dan ruang lingkup, belum seluruh syarat sertifikasi.',
    steps: ['Buka Asisten peran dan pilih tujuan selain Pemeriksa Dokumen.', 'Tekan BG atau BS untuk menampilkan daftar; ini belum mengubah skema aktif.', 'Pilih subklasifikasi lalu periksa kode, KBLI dan indikator aktif.', 'Jika ada draf/percakapan, pilih Batal untuk mempertahankannya atau konfirmasi untuk memulai konteks baru.', 'Ajukan pertanyaan ruang lingkup dan baca sumber. Gunakan Tanpa skema untuk kembali ke asisten umum.'],
    links: [privateLink('Buka Asisten peran', '/assistant')],
    related: ['Bagaimana menggunakan Asisten AI?', 'Bagaimana membaca sumber regulasi?'], source: userSource('08 / Pakar Skema'),
  },
  {
    id: 'regulations', title: 'Baca sumber beserta keterbatasannya',
    keywords: ['pusat regulasi', 'membaca sumber', 'sumber regulasi', 'knowledge base', 'locator', 'rujukan', 'verified', 'unverified'],
    summary: 'Peraturan primer, panduan, contoh institusional dan paparan mempunyai kedudukan berbeda. Tanggal pemeriksaan bukan otomatis tanggal berlaku.',
    steps: ['Buka Pusat regulasi dan pilih topik/sumber yang relevan.', 'Baca judul, penerbit, versi, tanggal, status verifikasi dan keterbatasan.', 'Gunakan locator pasal/bagian/halaman. Nomor PDF dapat berbeda dari halaman cetak.', 'Buka pembaca PDF bila tersedia dan cocokkan konteks; tautan institusi belum tentu tautan PDF asli.', 'Konfirmasikan ketentuan operasional kepada pihak berwenang bila dasar atau keberlakuannya belum jelas.'],
    links: [privateLink('Pusat regulasi', '/regulations')],
    related: ['Bagaimana memakai Pakar Skema BG dan BS?', 'Bagaimana menggunakan Asisten AI?'], source: userSource('09 / Pusat regulasi'),
  },
  {
    id: 'personnel', title: 'Catat personel dan SKK dengan teliti',
    keywords: ['personel', 'personil', 'skk', 'tenaga teknik', 'tenaga kerja', 'penugasan', 'nomor sertifikat'],
    summary: 'Pencatatan personel/SKK membantu persiapan; tidak memverifikasi penerbit atau menjamin kecocokan dengan skema.',
    steps: ['Buka Personel & SKK lalu tambahkan personel sesuai formulir.', 'Buka detail personel, catat sertifikat dan cocokkan nomor, jenjang serta tanggal dengan berkas asli.', 'Hubungkan penugasan/dokumen bila fasilitas tersedia dan konteks kasus sesuai.', 'Perbarui catatan saat sertifikat berubah; konfirmasikan pemetaan peran/SKK kepada pihak berwenang jika belum jelas.'],
    links: [privateLink('Personel & SKK', '/personnel')],
    related: ['Bagaimana unggah dokumen?', 'Bagaimana unduh ringkasan persiapan?'], source: userSource('10 / Personel & SKK'),
  },
  {
    id: 'workroom', title: 'Ubah temuan menjadi tindak lanjut',
    keywords: ['ruang kerja kasus', 'workroom', 'tindak lanjut', 'daftar periksa', 'persetujuan internal', 'tinjauan internal', 'snapshot', 'penanggung jawab'],
    summary: 'Ruang kerja mencatat pekerjaan internal. Menulis nama penanggung jawab tidak memberi akses akun atau mengirim undangan.',
    steps: ['Buka Kasus SBU, pilih kasus lalu Ruang kerja kasus.', 'Tambahkan/perbarui tindakan dengan judul konkret, status, penanggung jawab, tenggat dan catatan.', 'Simpan lalu periksa hasil. Jika revisi berubah, baca keadaan terbaru sebelum menyimpan ulang.', 'Untuk tinjauan internal, baca snapshot bahan dan catat keputusan/catatan yang tersedia.', 'Perubahan bahan dapat memerlukan telaah ulang. Persetujuan internal bukan persetujuan LSBU/OSS.'],
    links: [privateLink('Buka daftar kasus', '/cases'), privateLink('Agenda kasus', '/agenda')],
    related: ['Bagaimana menggunakan agenda kasus?', 'Bagaimana mengisi checklist SMAP?'], source: userSource('11 / Ruang kerja kasus'),
  },
  {
    id: 'smap', title: 'Isi deklarasi SMAP lalu telaah versi tersimpan',
    keywords: ['smap', 'pancek', 'checklist smap', 'check list smap', 'antisuap', 'anti suap', 'integritas'],
    summary: 'Checklist internal SMAP adalah alat persiapan. Tidak menerbitkan sertifikat ISO, konfirmasi PANCEK, atau persetujuan KPK/LSBU.',
    steps: ['Buka suatu kasus lalu Checklist internal SMAP.', 'Pilih butir, baca rujukan/fokus telaah, lalu isi Ada/Tidak ada/Belum dijawab beserta catatan.', 'Tautkan dokumen terbaru yang siap/bersih dari kasus yang sama bila relevan, lalu simpan deklarasi.', 'Telaah versi tersimpan dan catat keputusan serta alasan.', 'Jika dokumen atau deklarasi berubah, periksa penanda perlu telaah ulang dan riwayat versinya.'],
    links: [privateLink('Buka daftar kasus', '/cases')],
    related: ['Bagaimana unggah dokumen?', 'Bagaimana menggunakan ruang kerja kasus?'], source: userSource('12 / Checklist SMAP'),
  },
  {
    id: 'agenda', title: 'Lihat tindakan melalui Agenda kasus',
    keywords: ['agenda', 'tenggat', 'deadline', 'kalender', 'ics', 'jadwal', 'pengingat'],
    summary: 'Agenda membaca tindakan tersimpan pada kasus akun Anda. Ekspor kalender adalah salinan satu kali, bukan sinkronisasi atau tenggat resmi.',
    steps: ['Buka Agenda kasus untuk daftar lintas kasus milik akun, atau agenda di dalam kasus.', 'Gunakan pencarian serta filter aktif, terlewat, hari ini, selesai atau pilihan lain yang tersedia.', 'Buka tindakan untuk memperbaruinya pada kasus yang benar.', 'Jika mengekspor .ics dari agenda kasus, tinjau privasinya. Ekspor dapat mencakup semua tindakan aktif bertenggat valid, bukan hanya hasil filter.', 'Perubahan di aplikasi tidak otomatis memperbarui kalender luar; judul tindakan dapat berisi informasi privat.'],
    links: [privateLink('Agenda kasus', '/agenda')],
    related: ['Bagaimana menggunakan ruang kerja kasus?', 'Bagaimana unduh ringkasan persiapan?'], source: userSource('13 / Agenda'),
  },
  {
    id: 'export', title: 'Unduh atau cetak ringkasan kasus',
    keywords: ['ringkasan persiapan', 'unduh ringkasan', 'download ringkasan', 'cetak', 'ekspor', 'export', 'simpan pdf', 'laporan kasus'],
    summary: 'Ringkasan adalah salinan keadaan persiapan pada saat dibuat, bukan keputusan sertifikasi atau berkas yang terus tersinkron.',
    steps: ['Buka kasus yang benar dan periksa identitas serta perubahan terakhir.', 'Gunakan fasilitas ringkasan persiapan, lalu pilih unduh atau cetak.', 'Tunggu pemuatan selesai dan periksa isi, rujukan, tanggal/acuan serta peringatan.', 'Untuk cetak, periksa pratinjau semua halaman; mulai dari A4 portrait dan skala wajar.', 'Buat ringkasan baru setelah perubahan dan bagikan hanya kepada pihak yang berwenang.'],
    links: [privateLink('Buka daftar kasus', '/cases')],
    related: ['Bagaimana mencatat bukti?', 'Mengapa simpan atau chat gagal?'], source: userSource('14 / Ringkasan dan ekspor'),
  },
  {
    id: 'mini', title: 'Latihan melalui Simulator dan Mini Apps',
    keywords: ['simulator', 'simulasi', 'mini apps', 'mini app', 'kalkulator', 'masa berlaku', 'pelacak tindakan', 'konsistensi identitas', 'data contoh'],
    summary: 'Alat bantu ini memakai isian/deklarasi. Hasilnya bukan verifikasi berkas, skor kelulusan atau peluang sertifikasi.',
    steps: ['Buka Mini Apps SBU dan cari alat yang diperlukan, atau langsung Simulator SBU.', 'Pada simulator, isi konteks dan kondisi bahan. Muat DATA CONTOH hanya bila bersedia menimpa isian saat ini.', 'Baca pernyataan batas penggunaan sebelum menampilkan hasil.', 'Baca temuan/tindak lanjut dan unduh laporan teks bila diperlukan.', 'Isian alat lokal belum tentu tersimpan permanen; catat hasil penting sebelum meninggalkan halaman.'],
    links: [publicLink('Mini Apps SBU', '/mini-apps'), publicLink('Simulator SBU', '/simulator')],
    related: ['Bagaimana membuat kasus SBU?', 'Bagaimana menggunakan agenda kasus?'], source: userSource('15 / Simulator dan Mini Apps'),
  },
  {
    id: 'clinic', title: 'Gunakan Klinik Konsultasi sesuai bahan yang dipilih',
    keywords: ['klinik', 'konsultasi', 'pendampingan', 'jasa pengurusan', 'whatsapp'],
    summary: 'Klinik membantu pembahasan terstruktur. Membuka konsultasi tidak otomatis menugaskan konsultan manusia atau mengajukan berkas ke LSBU.',
    steps: ['Masuk dan buka Klinik Konsultasi.', 'Ikuti formulir/pilihan yang tersedia dan jelaskan tujuan secara ringkas.', 'Tinjau setiap bahan/cuplikannya sebelum memberi persetujuan pemrosesan.', 'Periksa hasil dan sumber, kemudian catat tindak lanjut yang memerlukan manusia.', 'Untuk formulir jasa di landing page, tinjau ringkasan sebelum membuka WhatsApp; pesan baru terkirim setelah Anda mengirim sendiri di WhatsApp.'],
    links: [privateLink('Klinik Konsultasi', '/consultations')],
    related: ['Bagaimana menggunakan Asisten AI?', 'Bagaimana menggunakan ruang kerja kasus?'], source: userSource('16 / Alur penggunaan'),
  },
  {
    id: 'permissions', title: 'Peran profil bukan akses administratif',
    keywords: ['super admin', 'admin', 'user', 'hak akses', 'izin', 'menu tidak muncul', 'menu kasus', 'peran', 'roles'],
    summary: 'Kontraktor/Konsultan dapat memakai ruang kasus sesuai izin. Profesional/Asosiasi belum mempunyai ruang kasus bersama. Peran chat tidak memberikan kewenangan resmi.',
    steps: ['Periksa peran profil melalui Pengaturan dan pilih sesuai kegiatan sebenarnya.', 'Admin BUJK yang mengelola kasus akun sendiri mengikuti alur User.', 'Admin pengelola/penelaah dan Super Admin adalah tanggung jawab operasional; tidak ada hierarki akses umum tiga tingkat melalui profil.', 'Menu Telaah sumber transisi hanya muncul bagi akun yang diizinkan server.', 'Jika izin tidak sesuai penugasan, hubungi pengelola tanpa meminjam akun atau mencoba melewati penolakan.'],
    links: [privateLink('Pengaturan', '/settings')],
    related: ['Bagaimana mengubah profil?', 'Bagaimana mulai menggunakan aplikasi?'], source: 'Panduan User · 02; Panduan Admin · 01 / Batas akses',
  },
  {
    id: 'troubleshooting', title: 'Periksa pesan, sesi dan keadaan terbaru',
    keywords: ['gagal', 'error', 'tidak bisa', 'tidak aktif', 'dinonaktifkan', 'kuota', 'anggaran', 'koneksi', 'konflik', 'terkunci', 'tidak tampil', 'tidak muncul', 'publish', 'muat ulang'],
    summary: 'Help Desk tidak dapat melihat status akun, memulihkan data, mengubah kuota atau memastikan layanan sudah pulih. Berikut pemeriksaan yang dapat Anda lakukan.',
    steps: ['Baca pesan kesalahan dan pastikan akun, kasus, versi serta lingkungan yang dibuka benar.', 'Untuk simpan gagal, periksa apakah hasil sudah tersimpan sebelum mengulang. Untuk konflik revisi, muat keadaan terbaru.', 'Untuk chat, periksa persetujuan, cuplikan wajib bila relevan, kuota dan anggaran; gunakan Periksa lagi bila ditawarkan.', 'Untuk dokumen, tunggu status siap/pemindaian dan ikuti batas format/ukuran.', 'Jika tetap gagal, laporkan menu, langkah dan pesan yang disamarkan kepada pengelola. Jangan kirim password, token atau isi dokumen privat.'],
    links: [privateLink('Ringkasan ruang kerja', '/dashboard')],
    related: ['Bagaimana masuk akun?', 'Bagaimana unggah dokumen?', 'Bagaimana menggunakan Asisten AI?'], source: userSource('17 / Kendala dan pemulihan'),
  },
  {
    id: 'privacy', title: 'Jaga dokumen dan identitas tetap terbatas',
    keywords: ['privasi', 'keamanan', 'data saya', 'data orang lain', 'bocor', 'rahasia', 'siapa membaca', 'riwayat bantuan'],
    summary: 'Help Desk menjawab dari panduan lokal. Pertanyaan bantuan tidak dikirim ke AI dan tidak disimpan permanen oleh widget ini; jangan tetap memasukkan credential atau isi dokumen.',
    steps: ['Gunakan akun sendiri dan pastikan kasus/versi sebelum mengubah atau membagikan bahan.', 'Berikan persetujuan AI hanya untuk bahan minimum yang Anda berwenang kirim; dialog dokumen bukan pembacaan seluruh penyimpanan.', 'Gunakan Percakapan baru untuk menghapus riwayat bantuan sementara. Muat ulang atau pergantian akun mengakhiri riwayat widget.', 'Jika data akun lain terlihat, hentikan alur dan laporkan kepada pengelola tanpa menyalin atau menyebarkannya.', 'Keluar akun saat selesai di perangkat bersama.'],
    links: [privateLink('Pengaturan', '/settings')],
    related: ['Apa beda Admin dan User?', 'Bagaimana berdialog tentang dokumen saya?'], source: userSource('18 / Keamanan'),
  },
];

const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const copy = (t: Topic, matched = true): HelpAnswer => ({
  topic: t.id, title: t.title, summary: t.summary, steps: [...t.steps],
  links: t.links.map(link => ({ ...link })), related: [...t.related], source: t.source, matched,
});

export function resolveHelpQuestion(question: string, previousTopic?: string): HelpAnswer {
  const q = normalize(question.slice(0, 600));
  if (q && /^(lalu|lanjut|selanjutnya|setelah itu|caranya|bagaimana caranya|jelaskan lagi|langkah selanjutnya)( ya| dong)?$/.test(q)) {
    const previous = topics.find(topic => topic.id === previousTopic);
    if (previous) return copy(previous);
  }
  // Legal/eligibility questions must not be answered as if this were the certification expert.
  if (/\b(modal|pasti lolos|pasti lulus|syarat skk|sertifikat sah|keaslian sertifikat|keputusan sertifikasi)\b/.test(q)
    || /\bberapa\b.*\b(alat|tenaga|pengalaman|biaya sertifikasi)\b/.test(q)) {
    return {
      ...copy(topics.find(topic => topic.id === 'assistant')!),
      topic: 'out-of-scope', title: 'Pertanyaan ini memerlukan bantuan substansi SBU',
      summary: 'Help Desk khusus cara menggunakan aplikasi, bukan penentu persyaratan, biaya sertifikasi, keaslian atau kelulusan. Gunakan Asisten peran untuk pembahasan bersumber, lalu konfirmasikan keputusan kepada LSBU/pihak berwenang.',
      related: ['Bagaimana menggunakan Asisten AI?', 'Bagaimana membaca sumber regulasi?'],
    };
  }
  const padded = ` ${q} `;
  let selected: Topic | undefined; let best = 0;
  for (const topic of topics) {
    const score = topic.keywords.reduce((sum, keyword) => {
      const phrase = normalize(keyword);
      return sum + (padded.includes(` ${phrase} `) ? (phrase.includes(' ') ? 8 + phrase.split(' ').length : 3) : 0);
    }, 0);
    if (score > best) { selected = topic; best = score; }
  }
  if (selected) return copy(selected);
  return {
    topic: 'unknown', title: 'Mari pilih bantuan yang paling dekat',
    summary: 'Saya belum menemukan petunjuk yang sesuai dalam panduan. Coba sebut nama menu dan tindakan, misalnya “unggah dokumen” atau “buat kasus”. Saya tidak menebak kondisi akun atau isi dokumen.',
    steps: ['Pilih salah satu pertanyaan cepat atau jelaskan menu dan langkah yang ingin dilakukan.', 'Untuk masalah yang belum terjawab, hubungi pengelola dengan pesan kesalahan yang disamarkan, tanpa credential atau isi dokumen privat.'],
    links: [publicLink('Coba Mini Apps SBU', '/mini-apps')],
    related: HELP_QUICK_QUESTIONS.slice(0, 3), source: userSource('01 dan 17 / Bantuan penggunaan'), matched: false,
  };
}
