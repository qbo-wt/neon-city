import * as THREE from 'three';

/** Objects on this layer show up in the wet ground (neon, windows, lamps, cars). */
export const REFLECT_LAYER = 1;

/**
 * Wet-street reflections: a mirrored copy of the camera, under the ground plane, renders the
 * reflecting layer into a small target every frame; the ground shader looks it up with projective
 * texturing (so the image lines up whatever the camera), ripples it and mixes it in where the
 * ground is wet (puddles reflect a lot, the rest of the asphalt a little).
 */
export class GroundReflection {
  readonly target: THREE.WebGLRenderTarget;
  private cam = new THREE.OrthographicCamera();
  readonly uniforms = {
    tRefl: { value: null as THREE.Texture | null },
    uReflMat: { value: new THREE.Matrix4() },
    uReflTime: { value: 0 },
    uReflStrength: { value: 1 },
  };
  enabled = true;

  constructor(private scale = 0.4) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.uniforms.tRefl.value = this.target.texture;
    this.cam.layers.set(REFLECT_LAYER);
  }

  setSize(w: number, h: number) { this.target.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale))); }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera, dt: number) {
    this.uniforms.uReflTime.value += dt;
    if (!this.enabled) return;
    const c = this.cam;
    c.left = camera.left; c.right = camera.right; c.top = camera.top; c.bottom = camera.bottom;
    c.near = camera.near; c.far = camera.far; c.zoom = camera.zoom;
    c.updateProjectionMatrix();
    // Mirror the camera in the plane y = 0.
    const pos = camera.position.clone(), dir = camera.getWorldDirection(new THREE.Vector3());
    c.position.set(pos.x, -pos.y, pos.z);
    c.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    c.up.y = -c.up.y;
    c.lookAt(pos.x + dir.x, -pos.y - dir.y, pos.z + dir.z);
    c.updateMatrixWorld();
    this.uniforms.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const bg = scene.background;
    scene.background = null;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, c);
    renderer.setRenderTarget(prevTarget);
    scene.background = bg;
    renderer.shadowMap.autoUpdate = prevAuto;
  }

  /**
   * Shader hook for a ground material (chained after the cel shading by stylize): `wet` is a
   * wetness mask sampled with the map's UVs.
   */
  groundHook(wet: THREE.Texture) {
    const u = this.uniforms;
    return (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, u, { tWet: { value: wet } });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uReflMat;\nvarying vec4 vReflPos;\nvarying vec3 vReflW;')
        .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 rw = modelMatrix * vec4(transformed, 1.0); vReflW = rw.xyz; vReflPos = uReflMat * rw; }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl;\nuniform sampler2D tWet;\nuniform float uReflTime;\nuniform float uReflStrength;\nvarying vec4 vReflPos;\nvarying vec3 vReflW;')
        .replace('#include <opaque_fragment>', `{
  float wet = texture2D(tWet, vMapUv).r;
  vec2 ruv = vReflPos.xy / vReflPos.w;
  float t = uReflTime;
  vec2 rip = vec2(sin(vReflW.x * 6.0 + t * 1.9) + sin(vReflW.z * 8.0 - t * 1.4) + sin((vReflW.x + vReflW.z) * 21.0 + t * 4.0) * 0.35, 0.0) * (0.0012 + 0.0018 * wet);
  vec3 refl = texture2D(tRefl, ruv + rip).rgb * 0.36
    + texture2D(tRefl, ruv + rip + vec2(0.0, 0.007)).rgb * 0.22 + texture2D(tRefl, ruv + rip - vec2(0.0, 0.007)).rgb * 0.22
    + texture2D(tRefl, ruv + rip + vec2(0.0, 0.016)).rgb * 0.1 + texture2D(tRefl, ruv + rip - vec2(0.0, 0.016)).rgb * 0.1;
  outgoingLight = outgoingLight * (1.0 - 0.35 * wet) + refl * (0.05 + 0.5 * wet) * uReflStrength;
}
#include <opaque_fragment>`);
    };
  }

  dispose() { this.target.dispose(); }
}
