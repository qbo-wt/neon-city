import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assetUrl, setAssetVersions } from '../../src/three/assetUrl';

describe('assetUrl', () => {
  it('leaves URLs alone until the manifest is known', () => {
    expect(assetUrl('assets/anims/ual.glb')).toBe('assets/anims/ual.glb');
  });

  it('appends the content hash of known files, whatever the prefix, and nothing else', () => {
    setAssetVersions([{ path: 'assets/anims/ual.glb', v: 'abc123' }, { path: 'assets/vrm/hero.vrm', v: 'def456' }]);
    expect(assetUrl('assets/anims/ual.glb')).toBe('assets/anims/ual.glb?v=abc123');
    expect(assetUrl('./assets/vrm/hero.vrm')).toBe('./assets/vrm/hero.vrm?v=def456');
    expect(assetUrl('https://x.app/assets/vrm/hero.vrm')).toBe('https://x.app/assets/vrm/hero.vrm?v=def456');
    expect(assetUrl('assets/vrm/lo.vrm')).toBe('assets/vrm/lo.vrm');
    expect(assetUrl('assets/anims/ual.glb?v=old')).toBe('assets/anims/ual.glb?v=old');
    expect(assetUrl('blob:assets/anims/ual.glb')).toBe('blob:assets/anims/ual.glb');
  });

  it('is what every three.js loader resolves through', () => {
    expect(THREE.DefaultLoadingManager.resolveURL('assets/anims/ual.glb')).toBe('assets/anims/ual.glb?v=abc123');
  });
});
