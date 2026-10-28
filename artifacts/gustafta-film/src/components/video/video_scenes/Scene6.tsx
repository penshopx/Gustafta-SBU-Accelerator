import { motion } from 'framer-motion';
import { EASE, Reveal, Shot, useBeats } from '../FilmParts';

export function Scene6() {
  const beat = useBeats([700, 1300, 2100, 2800, 4300]);
  return <Shot name="Gustafta" className="finale" exit="split">
    <motion.div className="finale-lockup" animate={{ scale: beat >= 5 ? .94 : 1 }} transition={{ duration: .7, ease: EASE }}>
      <img className="brand-logo" src={`${import.meta.env.BASE_URL}images/logo.svg`} alt="gustafta" />
      <Reveal delay={.3} className="eyebrow product-name">SBU ACCELERATOR</Reveal>
      <div className="finale-message"><Reveal delay={.7}><h1>Kumpulkan. Baca.</h1></Reveal><Reveal delay={1.3}><h1 className="cobalt">Tindak lanjuti.</h1></Reveal></div>
      <Reveal delay={2.1} className="support">Ruang kerja persiapan SBU.</Reveal>
      <Reveal delay={2.8} className="finale-note">Independen • bukan jaminan penerbitan SBU.</Reveal>
    </motion.div>
    <motion.div className="finale-line" initial={{ scaleX: .05 }} animate={{ scaleX: 1 }} transition={{ duration: 4.8, ease: 'linear' }} />
    <motion.div className="loop-sheet" animate={{ y: beat >= 5 ? '-12%' : '100%', rotate: beat >= 5 ? -4 : 12 }} transition={{ duration: .7, ease: EASE }} />
  </Shot>;
}