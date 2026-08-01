import { describe, it, expect } from "vitest";
import { FilterChain } from "./FilterChain.ts";

describe("FilterChain Presets & Custom Registry", () => {
  it("should apply SlowedReverb preset", () => {
    const chain = new FilterChain();
    chain.setSlowedReverb(true);
    expect(chain.has("timescale")).toBe(true);
    expect(chain.has("lowPass")).toBe(true);
  });

  it("should calculate correct pitch shift for semitones", () => {
    const chain = new FilterChain();
    chain.setPitchShift(12); // 1 octave up -> pitch 2.0
    const payload = chain.toPayload();
    expect(payload.timescale?.pitch).toBeCloseTo(2.0, 5);
  });

  it("should register and apply custom presets", () => {
    FilterChain.registerPreset("superbass", {
      equalizer: [{ band: 0, gain: 0.5 }],
    });

    const chain = new FilterChain();
    const applied = chain.applyPreset("superbass");
    expect(applied).toBe(true);
    expect(chain.has("equalizer")).toBe(true);
    expect(chain.toPayload().equalizer).toEqual([{ band: 0, gain: 0.5 }]);
  });
});
