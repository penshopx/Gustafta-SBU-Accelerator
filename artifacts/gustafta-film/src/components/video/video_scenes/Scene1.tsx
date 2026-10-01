import { motion } from 'framer-motion';
import { Doc, EASE, Reveal, Shot, useBeats } from '../FilmParts';

export function Scene1() {
  const beat = useBeats([450, 950, 1450, 2200, 2800, 3300, 3800]);
  return <Shot name="Persiapan SBU" className="opener blueprint">
    <div className="eyebrow top-label">GUSTAFTA / SBU ACCELERATOR</div>
    <div className="opener-copy"><Reveal><h1>Persiapan</h1></Reveal><Reveal delay={.45}><h1 className="blue giant">SBU.</h1></Reveal>
      <div className="application-types"><Reveal delay={.95}>Baru</Reveal><Reveal delay={1.45}>Perpanjangan</Reveal></div>
      <Reveal delay={2.2} className="support">Rapi sejak awal.</Reveal></div>
    <motion.div className="dossier" animate={{ scale: beat >= 7 ? 1.17 : beat >= 6 ? 1.04 : 1, rotate: beat >= 7 ? 0 : -4 }}
      transition={{ duration: .65, ease: EASE }}>
      <motion.div className="sheet-back" initial={{ rotate: 15, x: '12%', y: '7%' }} animate={{ rotate: beat >= 2 ? 5 : 15, x: beat >= 2 ? '4%' : '12%' }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} />
      <motion.div className="sheet-mid" initial={{ rotate: -18, x: '-12%' }} animate={{ rotate: beat >= 3 ? -4 : -18, x: beat >= 3 ? '-3%' : '-12%' }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} />
      <Doc title="Permohonan SBU" />
      <motion.div className="sheet-stamp" initial={{ opacity: 0, scale: 1.7 }} animate={{ opacity: beat >= 4 ? 1 : 0, scale: beat >= 4 ? 1 : 1.7 }}>PERSIAPAN</motion.div>
      <motion.div className="trace-line" initial={{ scaleX: 0 }} animate={{ scaleX: beat >= 5 ? 1 : 0 }} transition={{ duration: .65 }} />
    </motion.div>
    <div className="scene-number">01 / PERSIAPAN</div>
  </Shot>;
}