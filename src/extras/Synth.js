import * as Tone from "tone";

class SynthClass {
  isSingleton = true;
  constructor() {
    const etherealSynth = new Tone.Synth({
      oscillator: {
        type: "sine",
      },
      envelope: {
        attack: 0.2,
        decay: 1.5,
        sustain: 0.3,
        release: 2,
      },
    });

    const reverb = new Tone.Reverb({
      decay: 4,
      preDelay: 0.01,
      wet: 0.7,
    }).toDestination();

    etherealSynth.connect(reverb);

    this.synth = etherealSynth;
  }

  clickSound = () => {
    this.synth.triggerAttackRelease("C5", "4n");
  };
}

export const Synth = new SynthClass();
