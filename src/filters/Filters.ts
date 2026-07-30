import type {
  EqualizerBand,
  KaraokeSettings,
  TimescaleSettings,
  TremoloSettings,
  VibratoSettings,
  RotationSettings,
  DistortionSettings,
  ChannelMixSettings,
  LowPassSettings,
} from "../types/protocol.ts";

export interface Filter {
  name: string;
  serialize(): Record<string, unknown>;
}

export class VolumeFilter implements Filter {
  public readonly name = "volume";
  public volume: number;

  public constructor(volume: number = 1.0) {
    this.volume = volume;
  }

  public serialize(): Record<string, unknown> {
    return { volume: this.volume };
  }
}

export class EqualizerFilter implements Filter {
  public readonly name = "equalizer";
  public bands: EqualizerBand[];

  public constructor(bands?: EqualizerBand[]) {
    this.bands = bands ?? [];
  }

  public setBand(band: number, gain: number): this {
    const existing = this.bands.find((b) => b.band === band);
    if (existing != null) {
      existing.gain = gain;
    } else {
      this.bands.push({ band, gain });
    }
    return this;
  }

  public clear(): void {
    this.bands = [];
  }

  public serialize(): Record<string, unknown> {
    if (this.bands.length === 0) return {};
    return { equalizer: this.bands };
  }
}

export class KaraokeFilter implements Filter {
  public readonly name = "karaoke";
  public settings: KaraokeSettings;

  public constructor(settings?: KaraokeSettings) {
    this.settings = { ...settings };
  }

  public serialize(): Record<string, unknown> {
    const keys = Object.keys(this.settings) as (keyof KaraokeSettings)[];
    const hasAny = keys.some((k) => this.settings[k] !== undefined);
    if (!hasAny) return {};
    return { karaoke: this.settings };
  }
}

export class TimescaleFilter implements Filter {
  public readonly name = "timescale";
  public settings: TimescaleSettings;

  public constructor(settings?: TimescaleSettings) {
    this.settings = { speed: 1.0, pitch: 1.0, rate: 1.0, ...settings };
  }

  public setSpeed(speed: number): this {
    this.settings.speed = speed;
    return this;
  }

  public setPitch(pitch: number): this {
    this.settings.pitch = pitch;
    return this;
  }

  public setRate(rate: number): this {
    this.settings.rate = rate;
    return this;
  }

  public serialize(): Record<string, unknown> {
    return { timescale: this.settings };
  }
}

export class TremoloFilter implements Filter {
  public readonly name = "tremolo";
  public settings: TremoloSettings;

  public constructor(settings?: TremoloSettings) {
    this.settings = { ...settings };
  }

  public serialize(): Record<string, unknown> {
    const keys = Object.keys(this.settings) as (keyof TremoloSettings)[];
    const hasAny = keys.some((k) => this.settings[k] !== undefined);
    if (!hasAny) return {};
    return { tremolo: this.settings };
  }
}

export class VibratoFilter implements Filter {
  public readonly name = "vibrato";
  public settings: VibratoSettings;

  public constructor(settings?: VibratoSettings) {
    this.settings = { ...settings };
  }

  public serialize(): Record<string, unknown> {
    const keys = Object.keys(this.settings) as (keyof VibratoSettings)[];
    const hasAny = keys.some((k) => this.settings[k] !== undefined);
    if (!hasAny) return {};
    return { vibrato: this.settings };
  }
}

export class RotationFilter implements Filter {
  public readonly name = "rotation";
  public settings: RotationSettings;

  public constructor(settings?: RotationSettings) {
    this.settings = { ...settings };
  }

  public serialize(): Record<string, unknown> {
    const keys = Object.keys(this.settings) as (keyof RotationSettings)[];
    const hasAny = keys.some((k) => this.settings[k] !== undefined);
    if (!hasAny) return {};
    return { rotation: this.settings };
  }
}

export class DistortionFilter implements Filter {
  public readonly name = "distortion";
  public settings: DistortionSettings;

  public constructor(settings?: DistortionSettings) {
    this.settings = { ...settings };
  }

  public serialize(): Record<string, unknown> {
    const keys = Object.keys(this.settings) as (keyof DistortionSettings)[];
    const hasAny = keys.some((k) => this.settings[k] !== undefined);
    if (!hasAny) return {};
    return { distortion: this.settings };
  }
}

export class ChannelMixFilter implements Filter {
  public readonly name = "channelMix";
  public settings: ChannelMixSettings;

  public constructor(settings?: ChannelMixSettings) {
    this.settings = { ...settings };
  }

  public serialize(): Record<string, unknown> {
    const keys = Object.keys(this.settings) as (keyof ChannelMixSettings)[];
    const hasAny = keys.some((k) => this.settings[k] !== undefined);
    if (!hasAny) return {};
    return { channelMix: this.settings };
  }
}

export class LowPassFilter implements Filter {
  public readonly name = "lowPass";
  public settings: LowPassSettings;

  public constructor(settings?: LowPassSettings) {
    this.settings = { ...settings };
  }

  public serialize(): Record<string, unknown> {
    const keys = Object.keys(this.settings) as (keyof LowPassSettings)[];
    const hasAny = keys.some((k) => this.settings[k] !== undefined);
    if (!hasAny) return {};
    return { lowPass: this.settings };
  }
}
