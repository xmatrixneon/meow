// lib/sound.ts
let audioBuffer: AudioBuffer | null = null;
let audioContext: AudioContext | null = null;

// Pre-load the sound on first user interaction so autoplay policy doesn't block it
export async function preloadNotificationSound(): Promise<void> {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioBuffer) return;
    const response = await fetch("/notification.wav");
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.error("[sound] preload failed:", err);
  }
}

export async function playNotificationSound(): Promise<void> {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    // Resume if suspended due to browser autoplay policy
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    // Decode fresh if not preloaded
    if (!audioBuffer) {
      await preloadNotificationSound();
    }
    if (!audioBuffer) return;

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch (err) {
    console.error("[sound] play failed:", err);
  }
}