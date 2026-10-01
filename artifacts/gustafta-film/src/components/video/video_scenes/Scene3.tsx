import { motion } from 'framer-motion';
import { Building2, Link2, ShieldCheck } from 'lucide-react';
import { Folder, Reveal, Shot, useBeats } from '../FilmParts';

export function Scene3() {
  const beat = useBeats([800, 1400, 1700, 2500, 3100, 3700, 4100]);
  return <Shot name="Koneksi atas izin" className="network-shot">
    <div className="network-field" /><Reveal className="network-title"><h1>Akses atas izin.</h1></Reveal>
    <div className="network-source"><Folder label="Ruang Simpan" /></div>
    <svg className="network-lines" viewBox="0 0 1600 900" preserveAspectRatio="none">
      {['M640 445 H780 Q825 445 825 390 V335 Q825 290 880 290 H1120', 'M640 445 H780 Q825 445 825 495 V555 Q825 600 880 600 H1120'].map((d, i) =>
        <motion.path key={d} d={d} fill="none" stroke="#82c8ff" strokeWidth="4" initial={{ pathLength: 0 }} animate={{ pathLength: beat >= (i ? 3 : 1) ? 1 : 0 }}
          transition={{ duration: .85 }} />)}
      <motion.circle r="9" fill="#e2f3ff" animate={{ cx: [670, 780, 825, 900, 1110], cy: [445, 445, 290, 290, 290], opacity: [0, 1, 1, 1, 0] }} transition={{ duration: 1.6, delay: 2.6, repeat: Infinity, repeatDelay: .5 }} />
    </svg>
    <motion.div className="permission-gate gate-one" initial={{ scale: .2, opacity: 0 }} animate={{ scale: beat >= 2 ? 1 : .2, opacity: beat >= 2 ? 1 : 0 }}><ShieldCheck /><span>izin</span></motion.div>
    <motion.div className="permission-gate gate-two" initial={{ scale: .2, opacity: 0 }} animate={{ scale: beat >= 4 ? 1 : .2, opacity: beat >= 4 ? 1 : 0 }}><ShieldCheck /><span>izin</span></motion.div>
    <Reveal delay={.8} className="app-node sbu-node"><Link2 /><span>SBU<br />Accelerator</span></Reveal>
    <Reveal delay={1.7} className="app-node other-node"><Building2 /><span>Aplikasi<br />lain</span></Reveal>
    <Reveal delay={2.5} className="network-caption support">Koneksi terpisah untuk setiap aplikasi.</Reveal>
    <div className="concept-note">Ilustrasi integrasi • koneksi live belum aktif</div>
    <motion.div className="boundary-preview" animate={{ opacity: beat >= 7 ? .8 : 0, scale: beat >= 7 ? 1 : .7 }} />
  </Shot>;
}