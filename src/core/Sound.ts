import { THREE } from "../three-adapter";

class SoundClass {
  isSingleton = true;

  loader: any;
  listener: any;

  loadAudio(url: string, loop = false) {
    // Lazy init — most apps never load audio, so don't pay for the loader/listener up front.
    if (!this.listener) {
      this.loader = new THREE.AudioLoader();
      this.listener = new THREE.AudioListener();
    }

    const sound = new THREE.Audio(this.listener);
    this.loader.load(url, (buffer: any) => {
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
