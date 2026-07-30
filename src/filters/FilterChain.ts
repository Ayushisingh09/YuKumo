import type { Filter } from "./Filters.ts";
import {
  VolumeFilter,
  EqualizerFilter,
  KaraokeFilter,
  TimescaleFilter,
  TremoloFilter,
  VibratoFilter,
  RotationFilter,
  DistortionFilter,
  ChannelMixFilter,
  LowPassFilter,
} from "./Filters.ts";
import type { FiltersObject } from "../types/protocol.ts";

export class FilterChain {
  private readonly filters: Map<string, Filter> = new Map();

  public add(filter: Filter): this {
    this.filters.set(filter.name, filter);
    return this;
  }

  public remove(name: string): boolean {
    return this.filters.delete(name);
  }

  public get(name: string): Filter | undefined {
    return this.filters.get(name);
  }

  public has(name: string): boolean {
    return this.filters.has(name);
  }

  public clear(): void {
    this.filters.clear();
  }

  public getAll(): Filter[] {
    return Array.from(this.filters.values());
  }

  public toPayload(): FiltersObject {
    const payload: FiltersObject = {};

    for (const filter of this.filters.values()) {
      const serialized = filter.serialize();
      Object.assign(payload, serialized);
    }

    return payload;
  }

  public apply(payload: FiltersObject): void {
    this.clear();

    if (payload.volume !== undefined) {
      this.add(new VolumeFilter(payload.volume));
    }

    if (payload.equalizer !== undefined) {
      this.add(new EqualizerFilter(payload.equalizer));
    }

    if (payload.karaoke !== undefined) {
      this.add(new KaraokeFilter(payload.karaoke));
    }

    if (payload.timescale !== undefined) {
      this.add(new TimescaleFilter(payload.timescale));
    }

    if (payload.tremolo !== undefined) {
      this.add(new TremoloFilter(payload.tremolo));
    }

    if (payload.vibrato !== undefined) {
      this.add(new VibratoFilter(payload.vibrato));
    }

    if (payload.rotation !== undefined) {
      this.add(new RotationFilter(payload.rotation));
    }

    if (payload.distortion !== undefined) {
      this.add(new DistortionFilter(payload.distortion));
    }

    if (payload.channelMix !== undefined) {
      this.add(new ChannelMixFilter(payload.channelMix));
    }

    if (payload.lowPass !== undefined) {
      this.add(new LowPassFilter(payload.lowPass));
    }
  }

  public clone(): FilterChain {
    const chain = new FilterChain();
    for (const filter of this.filters.values()) {
      chain.filters.set(filter.name, filter);
    }
    return chain;
  }
}
