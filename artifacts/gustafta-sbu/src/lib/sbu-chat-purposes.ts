import type { SbuChatPurpose } from '@workspace/api-client-react';

export type PurposeInfo = {
  id: SbuChatPurpose;
  label: string;
  desc: string;
  intro: string;
  questions: string[];
  expected: string;
  prompts: string[];
  note?: string;
};

export const DEFAULT_PURPOSE: SbuChatPurpose = 'tutor_regulasi';

export const PURPOSES: PurposeInfo[] = [
  { id: 'tutor_regulasi', label: 'Tutor Regulasi', desc: 'Memahami istilah dan alur ketentuan SBU langkah demi langkah.',
    intro: 'Tanyakan istilah, alur, atau ketentuan SBU. Asisten menjelaskan bertahap dan menunjuk bagian sumber yang perlu Anda baca sendiri.',
    questions: ['Ketentuan atau istilah apa yang ingin dipahami?', 'Apakah Anda sudah membaca sumber primernya?'],
    expected: 'Penjelasan bertahap, contoh sederhana, dan penanda sumber untuk diperiksa.',
    prompts: ['Jelaskan secara garis besar apa itu SBU dan siapa yang berkepentingan.', 'Istilah apa yang perlu saya pahami sebelum membaca regulasi SBU?', 'Bagaimana cara memeriksa bahwa informasi yang saya baca masih berlaku?'] },
  { id: 'permohonan_baru', label: 'Panduan Permohonan Baru', desc: 'Menyiapkan berkas untuk permohonan SBU pertama kali.',
    intro: 'Susun urutan persiapan permohonan SBU baru. Ceritakan secara umum jenis usaha dan klasifikasi yang dituju, tanpa data sensitif.',
    questions: ['Klasifikasi dan kualifikasi apa yang dituju?', 'Dokumen apa yang sudah dan belum tersedia?', 'Siapa penanggung jawab yang akan terlibat?'],
    expected: 'Daftar tahapan persiapan, daftar periksa berkas, dan pertanyaan yang perlu dijawab sebelum pra-verifikasi.',
    prompts: ['Susun tahapan persiapan permohonan SBU baru dari awal sampai siap pra-verifikasi.', 'Buat daftar periksa berkas untuk permohonan SBU baru dan tandai yang sering terlewat.', 'Pertanyaan apa yang harus saya jawab dulu sebelum mengajukan SBU baru?'] },
  { id: 'perpanjangan', label: 'Panduan Perpanjangan SBU', desc: 'Menyiapkan perpanjangan atau pembaruan SBU yang sudah ada.',
    intro: 'Rencanakan perpanjangan SBU. Sebutkan secara umum kapan masa berlaku berakhir dan perubahan yang terjadi sejak penerbitan terakhir.',
    questions: ['Kapan perkiraan masa berlaku berakhir?', 'Apa yang berubah: personel, peralatan, keuangan, atau lainnya?', 'Apakah ada catatan dari proses sebelumnya?'],
    expected: 'Garis waktu persiapan, daftar perubahan yang perlu didokumentasikan, dan hal yang perlu dikonfirmasi ke lembaga berwenang.',
    prompts: ['Buat garis waktu persiapan perpanjangan SBU mulai beberapa bulan sebelum masa berlaku berakhir.', 'Perubahan apa saja yang biasanya perlu saya dokumentasikan sebelum perpanjangan?', 'Apa beda persiapan perpanjangan dengan permohonan baru?'] },
  { id: 'pemeriksa_dokumen', label: 'Pemeriksa Dokumen', desc: 'Menelaah cuplikan teks anonim yang Anda tempel sendiri.',
    intro: 'Tempel cuplikan teks yang sudah dianonimkan pada kolom pesan. Asisten tidak membaca berkas, tidak mengambil data aplikasi, dan tidak memeriksa keaslian dokumen.',
    questions: ['Jenis dokumen apa dan untuk keperluan apa?', 'Bagian mana yang ingin ditelaah?', 'Apakah nama, NIB, NPWP, dan alamat sudah dihapus?'],
    expected: 'Catatan kelengkapan dan konsistensi berdasarkan teks yang Anda berikan saja, ditambah pertanyaan klarifikasi.',
    prompts: ['Berikut cuplikan anonim dari dokumen saya. Telaah kejelasan dan kelengkapannya:\n\n[tempel cuplikan di sini]', 'Tandai bagian cuplikan berikut yang ambigu atau tidak konsisten:\n\n[tempel cuplikan di sini]', 'Bantu saya menyusun pertanyaan klarifikasi dari cuplikan berikut:\n\n[tempel cuplikan di sini]'],
    note: 'Tidak ada berkas yang dibaca otomatis. Untuk analisis berkas yang sudah Anda unggah, gunakan Bedah Dokumen di Brankas dokumen.' },
  { id: 'studi_kasus', label: 'Pakar Studi Kasus', desc: 'Membahas skenario hipotetis dan pilihan langkahnya.',
    intro: 'Uraikan skenario hipotetis atau yang sudah disamarkan. Asisten membantu memetakan fakta, asumsi, pilihan, dan risiko, bukan memutuskan kasus Anda.',
    questions: ['Apa fakta pokok skenarionya?', 'Apa yang belum diketahui?', 'Keputusan apa yang ingin dipertimbangkan?'],
    expected: 'Pemetaan fakta dan asumsi, opsi langkah beserta pertimbangannya, dan hal yang perlu dikonfirmasi pihak berwenang.',
    prompts: ['Skenario: badan usaha mengubah penanggung jawab teknis di tengah persiapan SBU. Petakan fakta, asumsi, dan opsi langkahnya.', 'Bantu saya membedah skenario berikut menjadi fakta, asumsi, dan pertanyaan terbuka:\n\n[uraikan skenario]', 'Apa risiko dan alternatif jika dokumen pendukung belum lengkap menjelang tenggat?'] },
  { id: 'pendamping_proses', label: 'Pendamping Proses', desc: 'Menemani langkah berikutnya dalam proses yang sedang berjalan.',
    intro: 'Ceritakan posisi proses Anda saat ini. Asisten membantu menentukan langkah berikutnya dan menyusun catatan kerja; tidak melihat status kasus Anda.',
    questions: ['Di tahap mana Anda sekarang?', 'Apa hambatan terbesarnya?', 'Siapa yang perlu dihubungi berikutnya?'],
    expected: 'Langkah berikutnya yang konkret, urutan prioritas, dan draf catatan atau pesan tindak lanjut.',
    prompts: ['Saya sedang menyiapkan berkas dan bingung langkah berikutnya. Bantu urutkan prioritasnya.', 'Susun draf pesan tindak lanjut yang sopan untuk pihak yang berkas atau jawabannya masih saya tunggu.', 'Bantu saya membuat catatan kerja mingguan untuk proses SBU yang sedang berjalan.'] },
];

export const purposeInfo = (id: SbuChatPurpose): PurposeInfo => PURPOSES.find(p => p.id === id) ?? PURPOSES[0];
export const isPurpose = (v: unknown): v is SbuChatPurpose => PURPOSES.some(p => p.id === v);
