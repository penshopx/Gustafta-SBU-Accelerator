import { motion } from 'framer-motion';
import { FileText, LockKeyhole } from 'lucide-react';
import { Folder, Reveal, Shot, Tag, useBeats } from '../FilmParts';

export function Scene4() {
  const beat = useBeats([800, 1600, 2500, 3000, 3600, 4500]);
  return <Shot name="Batas yang jelas" className="folder-shot" exit="fold">
    <Tag className="future-badge">BATAS YANG JELAS</Tag>
    <div className="folder-copy"><Reveal><h1>Disiapkan<br /><span className="blue">di sini.</span></h1></Reveal>
      <Reveal delay={3.6} className="support">Pengajuan resmi tetap<br />lewat lembaga berwenang.</Reveal></div>
    <motion.div className="authorized-zone" animate={{ scale: beat >= 6 ? 1.08 : 1 }} transition={{ duration: .7 }}>
      <svg className="scope-outline" viewBox="0 0 500 470" preserveAspectRatio="none"><motion.rect x="5" y="5" width="490" height="460" rx="28" fill="none" stroke="#82c8ff" strokeWidth="3" strokeDasharray="9 8"
        initial={{ pathLength: .2 }} animate={{ pathLength: 1 }} transition={{ duration: .8 }} /></svg>
      <div className="scope-label">Ruang kerja Anda</div>
      <Folder label="Persiapan"><div className="permitted-files">{[0, 1, 2].map(i => <motion.div key={i} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .8 + i * .25 }}><FileText /></motion.div>)}</div></Folder>
    </motion.div>
    <div className="denied-zone"><Folder label="Pengajuan resmi" className="denied-folder" />
      <motion.div className="lock" initial={{ scale: .4, opacity: 0 }} animate={{ scale: beat >= 4 ? 1 : .4, opacity: beat >= 4 ? 1 : 0 }}><LockKeyhole /></motion.div>
      <Reveal delay={3} className="denial-label">Tidak dikirim otomatis</Reveal></div>
    <svg className="denied-path" viewBox="0 0 1600 900" preserveAspectRatio="none">
      <motion.path d="M1120 490 V600 H1180" fill="none" stroke="#ffcb7c" strokeWidth="4" initial={{ pathLength: 0 }} animate={{ pathLength: beat >= 3 ? 1 : 0 }} transition={{ duration: .6 }} />
      <motion.path d="M1169 589 L1191 611 M1191 589 L1169 611" fill="none" stroke="#ffcb7c" strokeWidth="5" initial={{ opacity: 0 }} animate={{ opacity: beat >= 3 ? 1 : 0 }} />
    </svg>
    <div className="scene-number">04 / BATAS</div>
  </Shot>;
}