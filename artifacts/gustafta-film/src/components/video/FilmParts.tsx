import { useState, type PropsWithChildren } from 'react';
import { motion } from 'framer-motion';
import { Building2, FileText, FolderClosed } from 'lucide-react';
import { useSceneTimer } from '@/lib/video';

export const EASE = [0.22, 1, 0.36, 1] as const;
export function useBeats(times: number[]) {
  const [beat, setBeat] = useState(0);
  useSceneTimer(times.map((time, i) => ({ time, callback: () => setBeat(i + 1) })));
  return beat;
}
export function Shot({ children, name, className = '', exit = 'zoom' }: PropsWithChildren<{ name: string; className?: string; exit?: 'zoom' | 'fold' | 'split' }>) {
  return <motion.section data-shot={name} className={`shot ${className}`}
    initial={{ scale: 1.08, opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
    animate={{ scale: 1, opacity: 1 }}
    exit={exit === 'fold' ? { rotateX: 12, scale: 1.2, opacity: 0, clipPath: 'inset(45% 0% 45% 0%)' } : exit === 'split' ? { scale: 1.16, opacity: 0, clipPath: 'inset(0% 48% 0% 48%)' } : { scale: 1.35, opacity: 0 }}
    transition={{ duration: .55, ease: EASE }}>{children}</motion.section>;
}
export function Reveal({ children, delay = 0, className = '' }: PropsWithChildren<{ delay?: number; className?: string }>) {
  return <motion.div className={className} initial={{ y: '35%', opacity: .15 }} animate={{ y: 0, opacity: 1 }}
    transition={{ delay, duration: .65, ease: EASE }}>{children}</motion.div>;
}
export function Doc({ className = '', title = 'Profil perusahaan' }: { className?: string; title?: string }) {
  return <div className={`doc ${className}`}><FileText className="doc-icon" /><div className="doc-title">{title}</div>
    <div className="doc-rule long" /><div className="doc-rule" /><div className="doc-rule long" /><div className="doc-rule short" />
    <div className="doc-bottom"><Building2 /> DATA PERUSAHAAN</div></div>;
}
export function Folder({ label, children, className = '' }: PropsWithChildren<{ label: string; className?: string }>) {
  return <div className={`folder ${className}`}><div className="folder-tab" /><div className="folder-front">
    <FolderClosed className="folder-icon" /><div className="folder-label">{label}</div>{children}</div></div>;
}
export function Tag({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={`tag ${className}`}>{children}</div>;
}