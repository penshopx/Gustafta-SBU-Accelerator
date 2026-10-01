import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';
import { SCENE_DETAILS } from './sceneMeta';

const formatTime = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
function PlaybackStatus({ sceneKeys, activeIndex, activeDuration, activeStartTime, totalDuration, tick, paused, onJumpTo }: {
  sceneKeys: string[]; activeIndex: number; activeDuration: number; activeStartTime: number;
  totalDuration: number; tick: number; paused: boolean; onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBase = useRef(0);
  useEffect(() => { setElapsed(0); elapsedBase.current = 0; }, [tick]);
  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(elapsedBase.current + performance.now() - start), 60);
    return () => { window.clearInterval(timer); elapsedBase.current += performance.now() - start; };
  }, [tick, paused]);
  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const total = Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration));
  return <>
    <div className="flex flex-1 items-center gap-1.5">{sceneKeys.map((key, index) => <button key={key}
      onClick={() => onJumpTo(index)} className="relative h-3 min-h-[12px] flex-1 overflow-hidden rounded-full bg-white/20 hover:h-4 hover:bg-white/30"
      aria-label={`Adegan ${index + 1}: ${SCENE_DETAILS[key]?.title}`} aria-current={index === activeIndex ? 'true' : undefined}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-white/90 transition-[width] duration-100" style={{ width: index === activeIndex ? `${progress * 100}%` : '0%' }} />
    </button>)}</div>
    <span className="font-mono text-xl text-white/70">{activeIndex + 1}/{sceneKeys.length}</span>
    <span className="min-w-[11ch] text-right font-mono text-xl text-white/90" role="timer">{formatTime(total)} / {formatTime(totalDuration)}</span>
  </>;
}
function ControlledPreview() {
  const controls = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);
  const jump = useCallback((index: number) => {
    controls.jumpTo(index);
    const details = SCENE_DETAILS[controls.sceneKeys[index]];
    if (details) window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: {
      sceneIndex: index, sceneCount: controls.sceneKeys.length, sceneTitle: details.title,
      filePath: details.filePath, lineNumber: 1,
    } }, '*');
  }, [controls.jumpTo, controls.sceneKeys]);
  useEffect(() => {
    if (!controls.paused) return;
    const animations = document.getAnimations().filter(a => a.playState === 'running');
    animations.forEach(a => a.pause());
    return () => animations.forEach(a => a.play());
  }, [controls.paused]);
  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && sensorRef.current && !sensorRef.current.contains(event.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [collapsed, tapPinned]);
  const pointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => { if (event.pointerType === 'mouse') setHovering(true); };
  const pointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => { if (event.pointerType === 'mouse') setHovering(false); };
  const visible = !collapsed || hovering || tapPinned;
  const toggleCollapsed = () => {
    setCollapsed(value => {
      if (!value) { setHovering(false); setTapPinned(false); }
      return !value;
    });
  };
  const buttonStyle = 'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white';
  return <div className="relative h-screen w-full">
    <VideoTemplate key={controls.mountKey} durations={controls.durations} loop paused={controls.paused} muted={muted} onSceneChange={controls.onSceneChange} />
    <div ref={sensorRef} className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end" style={{ height: '25%' }}
      onPointerEnter={pointerEnter} onPointerLeave={pointerLeave} onPointerDown={event => { if (event.pointerType !== 'mouse' && collapsed) setTapPinned(true); }}>
      <div className="w-full flex-1" aria-hidden="true" />
      <div aria-hidden={!visible} className={`flex items-center gap-3 bg-black/70 px-5 py-4 backdrop-blur-sm transition-all duration-200 ${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`}>
        <button className={buttonStyle} onClick={controls.togglePause} aria-label={controls.paused ? 'Putar' : 'Jeda'}>{controls.paused ? <Play size={32} /> : <Pause size={32} />}</button>
        <button className={buttonStyle} onClick={controls.toggleLock} aria-label="Ulangi adegan" aria-pressed={controls.locked}><Repeat size={32} /></button>
        <button className={buttonStyle} onClick={() => setMuted(value => !value)} aria-label={muted ? 'Aktifkan musik' : 'Bisukan musik'}>{muted ? <VolumeX size={32} /> : <Volume2 size={32} />}</button>
        <div className="w-px self-stretch bg-white/20" />
        <PlaybackStatus {...controls} onJumpTo={jump} />
        <button className={buttonStyle} onClick={toggleCollapsed} aria-label={collapsed ? 'Tampilkan kontrol' : 'Sembunyikan kontrol'} aria-expanded={!collapsed}>{collapsed ? <ChevronUp size={40} /> : <ChevronDown size={40} />}</button>
      </div>
    </div>
  </div>;
}
export default function VideoWithControls() {
  return typeof window !== 'undefined' && window.self !== window.top ? <ControlledPreview /> : <VideoTemplate />;
}