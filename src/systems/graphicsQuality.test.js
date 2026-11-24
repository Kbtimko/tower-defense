import { resolveGraphics, migrateGraphicsSetting, scaleBurst } from './graphicsQuality.js';

const desk = { webgl: true, touch: false }, phone = { webgl: true, touch: true }, canvas = { webgl: false, touch: false };

describe('graphicsQuality', () => {
  it('auto = today: grade on desktop WebGL only', () => {
    expect(resolveGraphics('auto', desk)).toEqual({ mapGrade: true, ambientFx: true, particleScale: 1 });
    expect(resolveGraphics('auto', phone)).toEqual({ mapGrade: false, ambientFx: true, particleScale: 1 });
    expect(resolveGraphics('auto', canvas).mapGrade).toBe(false);
  });
  it('high grades on touch; Canvas never grades (Review Focus 4)', () => {
    expect(resolveGraphics('high', phone).mapGrade).toBe(true);
    expect(resolveGraphics('high', canvas).mapGrade).toBe(false);
  });
  it('low turns grade and ambient off and halves bursts', () =>
    expect(resolveGraphics('low', desk)).toEqual({ mapGrade: false, ambientFx: false, particleScale: 0.5 }));
  it('garbage setting resolves as auto', () => expect(resolveGraphics('ultra', phone)).toEqual(resolveGraphics('auto', phone)));
  it('migration maps only mapGrade (Review Focus 3)', () => {
    expect(migrateGraphicsSetting({ mapGrade: false, ambientMotion: true })).toBe('low');
    expect(migrateGraphicsSetting({ mapGrade: true })).toBe('high');
    expect(migrateGraphicsSetting({ mapGrade: null })).toBe('auto');
    expect(migrateGraphicsSetting({})).toBe('auto');
    expect(migrateGraphicsSetting({ graphics: 'low', mapGrade: true })).toBe('low');
    expect(migrateGraphicsSetting({ graphics: 'ultra' })).toBe('auto');
  });
  it('scaleBurst never zeroes a real burst', () => {
    expect(scaleBurst(1, 0.5)).toBe(1); expect(scaleBurst(30, 0.5)).toBe(15); expect(scaleBurst(7, 0.5)).toBe(4);
    expect(scaleBurst(0, 0.5)).toBe(0); expect(scaleBurst(12, 1)).toBe(12);
  });
});
