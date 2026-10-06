import {test,expect} from 'bun:test';
import {synthesizeSnore} from './snore-audio';
test('short local snore has audible normalized level, safe headroom and soft edges',()=>{const a=synthesizeSnore(48000,()=>.5);expect(a.samples.length).toBe(43200);expect(a.peak).toBeLessThan(.3);expect(a.rms).toBeGreaterThan(.04);expect(a.rms).toBeLessThan(.12);expect(a.samples[0]).toBe(0);expect(Math.abs(a.samples.at(-1)!)).toBeLessThan(.00001);});
