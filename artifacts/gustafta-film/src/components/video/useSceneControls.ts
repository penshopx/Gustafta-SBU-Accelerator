import { useCallback, useMemo, useState } from 'react';
export const stripRepeatSuffix = (key: string) => key.replace(/_r[12]$/, '');
export function useSceneControls(baseDurations: Record<string, number>) {
  const sceneKeys = useMemo(() => Object.keys(baseDurations), [baseDurations]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [tick, setTick] = useState(0);
  const durations = useMemo(() => {
    if (locked) {
      const key = sceneKeys[activeIndex];
      return { [`${key}_r1`]: baseDurations[key], [`${key}_r2`]: baseDurations[key] };
    }
    return Object.fromEntries(sceneKeys.map((_, i) => {
      const key = sceneKeys[(activeIndex + i) % sceneKeys.length];
      return [key, baseDurations[key]];
    }));
  }, [locked, activeIndex, sceneKeys, baseDurations]);
  const onSceneChange = useCallback((rawKey: string) => {
    const index = sceneKeys.indexOf(stripRepeatSuffix(rawKey));
    if (index >= 0) setActiveIndex(index);
    setTick(t => t + 1);
  }, [sceneKeys]);
  const jumpTo = useCallback((index: number) => {
    setActiveIndex(index); setPaused(false); setMountKey(k => k + 1); setTick(t => t + 1);
  }, []);
  const toggleLock = useCallback(() => {
    setLocked(prev => !prev); setPaused(false); setMountKey(k => k + 1); setTick(t => t + 1);
  }, []);
  const togglePause = useCallback(() => setPaused(prev => !prev), []);
  return {
    sceneKeys, activeIndex, locked, paused, mountKey, tick, durations,
    activeDuration: baseDurations[sceneKeys[activeIndex]] ?? 0,
    activeStartTime: sceneKeys.slice(0, activeIndex).reduce((sum, key) => sum + baseDurations[key], 0),
    totalDuration: Object.values(baseDurations).reduce((sum, ms) => sum + ms, 0),
    onSceneChange, jumpTo, toggleLock, togglePause,
  };
}