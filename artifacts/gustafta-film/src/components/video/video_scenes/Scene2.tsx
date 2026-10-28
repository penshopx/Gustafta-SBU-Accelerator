import { motion } from 'framer-motion';
import { Building2, FileText } from 'lucide-react';
import { EASE, Folder, Reveal, Shot, useBeats } from '../FilmParts';

export function Scene2() {
  const beat = useBeats([700, 1400, 2200, 2800, 3600, 4500]);
  return <Shot name="Ruang Simpan" className="source-shot" exit="split">
    <div className="center-title"><div className="eyebrow">PRIVAT DI AKUN ANDA</div><Reveal delay={.25}><h1>Ruang Simpan</h1></Reveal>
      <Reveal delay={1} className="support">Bukti dideklarasikan di kasus.</Reveal></div>
    <motion.div className="source-vault" animate={{ scale: beat >= 6 ? .85 : 1, x: beat >= 6 ? '-7vw' : 0, rotate: beat >= 6 ? -4 : 0 }} transition={{ duration: .8, ease: EASE }}>
      <div className="vault-orbit" />
      <motion.div className="source-input profile-input" initial={{ x: '-14vw', opacity: 0 }} animate={{ x: beat >= 3 ? '1vw' : '-7vw', opacity: beat >= 3 ? 0 : 1, scale: beat >= 3 ? .45 : 1 }} transition={{ duration: .75, delay: .5 }}>
        <Building2 /><span>Kasus<br />SBU</span></motion.div>
      <motion.div className="source-input file-input" initial={{ x: '14vw', opacity: 0 }} animate={{ x: beat >= 3 ? '-1vw' : '7vw', opacity: beat >= 3 ? 0 : 1, scale: beat >= 3 ? .45 : 1 }} transition={{ duration: .8, delay: 1 }}>
        <FileText /><span>Salinan<br />dokumen</span></motion.div>
      <Folder label="Ruang Simpan"><motion.div className="source-lines" animate={{ scaleX: beat >= 3 ? 1 : .3 }} transition={{ duration: .8 }}><i /><i /><i /></motion.div></Folder>
    </motion.div>
    <div className="source-caption"><Reveal delay={2.8}>Tersimpan, belum terverifikasi.</Reveal><Reveal delay={3.6} className="blue">Tidak dibagikan ke luar.</Reveal></div>
    <div className="scene-number">02 / RUANG SIMPAN</div>
  </Shot>;
}