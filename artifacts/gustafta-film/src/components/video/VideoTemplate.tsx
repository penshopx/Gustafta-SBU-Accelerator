import { useEffect, useRef, type ComponentType } from 'react';
import { VideoCanvas, VideoPausedContext, type VideoAspectRatio, useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import './film.css';

export const SCENE_DURATIONS = {
  preparation: 4500, source: 5500, connections: 5000,
  folders: 5500, review: 4500, brand: 5000,
};
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';
const SCENES: Record<string, ComponentType> = {
  preparation: Scene1, source: Scene2, connections: Scene3,
  folders: Scene4, review: Scene5, brand: Scene6,
};
const SCENE_START_SEC = Object.fromEntries(Object.entries(SCENE_DURATIONS).map(([key], i, entries) =>
  [key, entries.slice(0, i).reduce((sum, [, ms]) => sum + ms, 0) / 1000]));
export default function VideoTemplate({
  durations = SCENE_DURATIONS, loop = true, paused = false, muted = false, onSceneChange,
}: {
  durations?: Record<string, number>; loop?: boolean; paused?: boolean; muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const Scene = SCENES[baseSceneKey];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneKey = useRef<string | null>(null);
  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = .45;
    if (paused) { audio.pause(); return; }
    if (lastSceneKey.current !== currentSceneKey) {
      lastSceneKey.current = currentSceneKey;
      const target = SCENE_START_SEC[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - target) > .18) audio.currentTime = target;
    }
    audio.play().catch(() => { audio.dataset.autoplay = 'blocked'; });
  }, [currentSceneKey, baseSceneKey, muted, paused]);
  return <VideoPausedContext.Provider value={paused}>
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: '#101f32' }}>
      <motion.div className="film-camera" initial={false} animate={{ scale: [1, 1.006, 1.008, 1.004, 1.007, 1][sceneIndex], rotate: [0, .15, -.1, .1, -.1, 0][sceneIndex] }} transition={{ duration: 1 }}>
        <AnimatePresence mode="sync">{Scene && <Scene key={currentSceneKey} />}</AnimatePresence>
      </motion.div>
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`} muted={muted} preload="auto" autoPlay />
    </VideoCanvas>
  </VideoPausedContext.Provider>;
}
