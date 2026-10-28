# Pakar Skema BS — batas intake dan pilot

Pilot Bangunan Sipil memakai **pemetaan serta penjelasan ruang lingkup** saja.
Bukan aktivasi seluruh skema, persyaratan kualifikasi/subkualifikasi, penilaian
keuangan, SKK, alat, pengalaman, jadwal transisi atau keputusan sertifikasi.

## Sumber yang ditelaah

- Skema Bangunan Sipil dari LSBU Konstruksi Indonesia:
  `attached_assets/2._Format_Standar_Skema_Sertifikasi_BS_1793181978048.pdf`.
  SSBS.2.LSBU-KI, edisi/revisi 01/11, review tercetak 21.09.2026.
  SHA-256 `4606ae2833ef52943064dec15de442fd2d92963b7c2dc86f1cf1713c6615e008`.
  Tabel bagian 2.1.5 pada PDF 21–23/cetak 7–9 dibaca sebagai pemetaan institusional,
  bukan bukti keaslian, pengesahan penerbit atau pemberlakuan universal.
  PDF 22 juga diperiksa visual.
- Buku KBLI 2025 BPS:
  `attached_assets/klasifikasi-baku-lapangan-usaha-indonesia--kbli--2025-_1793182029966.pdf`.
  SHA-256 `169ec324af12c3e535d081dbe3789e019f9131ab81460357c2453fd0651a56b3`.
  Uraian terarah PDF 576–582/cetak 560–566, termasuk kelanjutan entri lintas
  halaman. PDF 582 diperiksa visual untuk kelanjutan 42995 dan pengecualiannya.

## Pemetaan dan locator

Nomor PDF adalah 1-based. Kolom cetak dihitung dari halaman yang dibaca,
bukan menganggap offset sama untuk setiap dokumen.

| Subklasifikasi | KBLI | Skema PDF/cetak | KBLI PDF/cetak |
| --- | --- | --- | --- |
| BS001 | 42101 | 21/7 | 576/560 |
| BS002 | 42102 | 21/7 | 576/560 |
| BS003 | 42103 | 21/7 | 576/560 |
| BS004 | 42201 | 21/7 | 577/561 |
| BS005 | 42202 | 21/7 | 577–578/561–562 |
| BS006 | 42203 | 22/8 | 578/562 |
| BS007 | 42204 | 22/8 | 578/562 |
| BS008 | 42205 | 22/8 | 578/562 |
| BS009 | 42206 | 22/8 | 578/562 |
| BS010 | 42911 | 22/8 | 579/563 |
| BS011 | 42912 | 22/8 | 579–580/563–564 |
| BS012 | 42913 | 22/8 | 580/564 |
| BS013 | 42991 | 22/8 | 581/565 |
| BS014 | 42992 | 22/8 | 581/565 |
| BS015 | 42993 | 22/8 | 581/565 |
| BS016 | 42994 | 22/8 | 581/565 |
| BS017 | 42999 | 22/8 | 582/566 |
| BS018 | 42995 | 22/8 | 581–582/565–566 |
| BS019 | 42996 | 23/9 | 582/566 |
| BS020 | 42209 | 23/9 | 579/563 |

Kode KBLI **tidak berurutan menurut kode BS**. BS017 bukan 42995 dan BS020 bukan
42999. KBLI 42104, 42207, 42914, 42915, 42919, 42997 dan 42998 muncul dalam buku,
tetapi tidak otomatis diberi subklasifikasi baru dari tabel skema unggahan ini.

## Batas penting isi jawaban

- Jalan rel (42103) secara eksplisit tidak mencakup jembatan rel; jangan
  mengabaikan perbedaan ini dengan jembatan pada 42102.
- Entri fasilitas pengolahan 42995 berlanjut ke PDF 582. Pengecualian fasilitas
  pengolahan dengan sumber radiasi pengion (42997) harus tetap disebut bila
  relevan, bukan merangkum kelompok ini sebagai semua konstruksi pabrik.
- Catatan skema PDF 23 tentang KBLI 2020/2025 tidak dijadikan aturan transisi.
  Penetapan penerapan pada OSS memerlukan dasar dan telaah terpisah.
- Semua kartu pilot tetap `unverified`. Izin retrieval tidak sama dengan
  verifikasi legal atau keaslian dokumen.
- Dua sumber per pilihan: pemetaan institusional dan ruang lingkup KBLI.
  Sumber yang ditarik tidak boleh diganti diam-diam dengan ingatan model,
  BG atau subklasifikasi BS lain.
- Tautan adalah kanal rujukan, bukan PDF unggahan; Bina Konstruksi adalah kanal
  pembina, bukan situs penerbit LSBU. Buku KBLI lengkap tidak didistribusikan.

## Perilaku UI

Pemilih BG/BS hanya mengganti daftar yang ditampilkan, bukan konteks percakapan.
Pilihan skema aktual tetap ditampilkan. Pergantian skema dengan draf/percakapan
memerlukan konfirmasi; pembatalan mempertahankan keduanya. Konfirmasi menghapus
percakapan/draf dan meminta persetujuan ulang. Pemeriksa Dokumen dan chat
Ruang Simpan tidak mengirim konteks skema ini atau membaca dokumen otomatis.
