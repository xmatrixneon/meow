// lib/sound.ts
let audioBuffer: AudioBuffer | null = null;
let audioContext: AudioContext | null = null;

export async function preloadNotificationSound(): Promise<void> {
  try {
    if (!audioContext) audioContext = new AudioContext();
    if (audioBuffer) return;
    const response = await fetch("/notification.wav");
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.error("[sound] preload failed:", err);
  }
}

export async function playNotificationSound(): Promise<void> {
  // Check user preference — default to enabled if not set
  try {
    const stored = localStorage.getItem("sms-sound-enabled");
    if (stored === "false") return;
  } catch {}

  try {
    if (!audioContext) audioContext = new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    if (!audioBuffer) await preloadNotificationSound();
    if (!audioBuffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch (err) {
    console.error("[sound] play failed:", err);
  }
}