// Optional scene metadata for Replit workspace integrations. When the
// workspace's scene controls are enabled for this project, a viewer's click on
// a scene segment scopes their next chat request to that scene's source file.
// Fill one entry per SCENE_DURATIONS key in VideoTemplate.tsx only when a
// skill reference asks for it; otherwise leave the map empty. Scenes missing
// from the map still play and can be jumped to.
//
// Example:
//   export const SCENE_DETAILS: Record<string, SceneDetails> = {
//     open: { title: 'Intro', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
//   };

export interface SceneDetails {
  title: string;
  filePath: string;
}

export const SCENE_DETAILS: Record<string, SceneDetails> = {
  preparation: { title: 'Persiapan SBU', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
  source: { title: 'Satu sumber', filePath: 'src/components/video/video_scenes/Scene2.tsx' },
  connections: { title: 'Koneksi atas izin', filePath: 'src/components/video/video_scenes/Scene3.tsx' },
  folders: { title: 'Rencana akses folder', filePath: 'src/components/video/video_scenes/Scene4.tsx' },
  review: { title: 'Tinjau persiapan', filePath: 'src/components/video/video_scenes/Scene5.tsx' },
  brand: { title: 'Gustafta', filePath: 'src/components/video/video_scenes/Scene6.tsx' },
};
