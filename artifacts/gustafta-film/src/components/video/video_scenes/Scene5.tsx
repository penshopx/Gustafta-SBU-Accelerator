import { motion } from 'framer-motion';
import { ClipboardList } from 'lucide-react';
import { EASE, Reveal, Shot, useBeats } from '../FilmParts';

export function Scene5() {
  const beat = useBeats([300, 1300, 2300, 2800, 3600]);
  return <Shot name="Tinjau persiapan" className="review-shot blueprint" exit="fold">
    <div className="review-copy"><Reveal><h1>Tindak</h1></Reveal><Reveal delay={.7}><h1 className="blue">lanjuti.</h1></Reveal></div>
    <motion.div className="review-sheet" initial={{ rotate: 9 }} animate={{ rotate: beat >= 5 ? 0 : -3, scale: beat >= 5 ? 1.13 : 1 }} transition={{ duration: .8, ease: EASE }}>
      <div className="review-heading"><ClipboardList /><span>RENCANA TINDAKAN</span></div>
      {['Penanggung jawab & tenggat', 'Tinjauan internal', 'Ekspor persiapan'].map((text, i) =>
        <motion.div className="review-step" key={text} animate={{ opacity: beat >= i + 1 ? 1 : .25, backgroundColor: beat === i + 1 ? '#d9edff' : '#f4f9ff' }} transition={{ duration: .4 }}>
          <span className="step-index">0{i + 1}</span><span>{text}</span><motion.i initial={{ scaleY: .15 }} animate={{ scaleY: beat >= i + 1 ? 1 : .15 }} /></motion.div>)}
    </motion.div>
    <Reveal delay={2.8} className="review-caveat">Persiapan, bukan penerbitan SBU.</Reveal>
    <div className="scene-number">05 / LANGKAH PERSIAPAN</div>
  </Shot>;
}