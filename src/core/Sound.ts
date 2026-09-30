import { Audio, AudioListener, AudioLoader } from "three";

class SoundClass {
  isSingleton = true;

  private loader: AudioLoader | null = null;
  private listener: AudioListener | null = null;

  loadAudio(url: string, loop = false) {
    // Lazy init — most apps never load audio, so don't pay for the loader/listener up front.
    this.loader ??= new AudioLoader();
    this.listener ??= new AudioListener();

    const sound = new Audio(this.listener);
    this.loader.load(url, (buffer) => {
      sound.setBuffer(buffer);
      sound.setVolume(1);
      sound.setLoop(loop);
    });
    return sound;
  }

  destroy() {
    this.listener = null;
    this.loader = null;
  }
}

export const Sound = new SoundClass();
