/*
 * The fragment shader below is @craftedstudios/shaders 1.0.1
 * (https://shaders.craftedstudios.co, src/shader.js), the avatar half only,
 * by way of happy-ios's Metal port (`AvatarShaderSource.swift`) back to GLSL.
 *
 * MIT License, Copyright (c) 2026 Crafted Studios. Its full text is
 * licenses/Crafted-Studios-Shaders-MIT.txt (THIRD_PARTY_NOTICES.md).
 *
 * Changes from the original, as on the phone: only the five effects an
 * avatar's seed can pick (no metals) and no outlines; no goo, pointer
 * interaction, entrance or ring, so an avatar fills its square and its box
 * clips it; GLSL's smoothstep (which allows edges in either order, though the
 * spec leaves that undefined) written out; `hash`'s sine taken precisely.
 *
 * And two of desktop's own, for avatars drawn a few dozen pixels across: the
 * grain is frozen at the avatar's phase rather than drawn anew each frame,
 * where at that size it only shimmered, and topography's contour lines are
 * widened to the pixel where they would be thinner than one, rather than
 * flickering in and out of the pixel grid.
 *
 * That last one is what makes the noise the pictures': `hash` multiplies the
 * sine of an argument in the thousands by 43758.5 and keeps the fraction, so
 * an ulp of difference in the argument or a GPU's fast sine draws different
 * noise altogether. The phone uses Metal's precise sine on Metal's dot; here
 * both are computed in the shader to the bit (`dotHash`, `sinPrecise`), so
 * every GPU draws the same noise as the phone and the pictures.
 */

export const AVATAR_SHADER_VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const AVATAR_SHADER_FRAGMENT = `#version 300 es
precision highp float;

uniform vec3 u_col1, u_col2, u_col3, u_col4;
uniform vec4 u_layout;   // per-seed pattern offset (xy), turn (z) and zoom (w)
uniform float u_fx;      // which effect: 0 linear, 1 thermal, 2 topography, 3 plasma, 4 radial
uniform float u_t;       // seconds, phase included
uniform float u_angle;   // per-seed angle for effects that have a direction
uniform float u_warp;    // distortion: 1 is each effect's own amount
uniform float u_scale;   // pattern zoom
uniform float u_grain;
uniform float u_grainCell;
uniform float u_grainT;  // the clock the grain is frozen at: the avatar's phase
uniform float u_size;    // device px across
uniform vec2 u_origin;   // the tile's bottom-left corner in the shared canvas, device px
uniform float u_one;     // 1, for dotHash

out vec4 fragColor;

float sstep(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Cephes' sinf: the argument brought into [-π/4, π/4] in three exact steps
// (π/4 as 0.78515625 + B + C; the first two have 8 significant bits, so their
// products with any octant below 2^16 are exact), then its own polynomials.
// Within an ulp or two of the true sine on every GPU, where a GPU's own sine
// may be off in the sixth decimal even near zero.
float sinPrecise(float x) {
  float sign = x < 0.0 ? -1.0 : 1.0;
  float a = abs(x);
  float j = floor(a * 1.2732395);
  if (mod(j, 2.0) == 1.0) j += 1.0;
  float y = ((a - j * 0.78515625) - j * 0.00024127960205078125) - j * 6.337954232549237e-7;
  float q = mod(j, 8.0);
  if (q > 3.0) { sign = -sign; q -= 4.0; }
  float z = y * y;
  float r = q == 1.0 || q == 2.0
    ? ((2.443315711809948e-5 * z - 1.388731625493765e-3) * z + 4.166664568298827e-2) * z * z - 0.5 * z + 1.0
    : ((-1.9515295891e-4 * z + 8.3321608736e-3) * z - 1.6666654611e-1) * z * y + y;
  return sign * r;
}
// The original's dot(p, vec2(41.3, 289.1)), as Metal computes it, which the
// pictures and the phone share: fma(p.y, 289.1, round(p.x * 41.3)). The
// argument is in the thousands, so one ulp either way is a different hash.
// p is whole, 289.1 is 289 + 0.100006103515625 (9 and 12 significant bits),
// so both partial products are exact and their sum with q is rounded once
// (Knuth's two-sum). u_one, a uniform 1, keeps q rounded on its own where a
// compiler would otherwise fuse it into the addition.
float dotHash(vec2 p) {
  float q = p.x * 41.3 * u_one;
  float a = p.y * 289.0;
  float b = p.y * 0.100006103515625;
  float s = a + q;
  float v = s - a;
  float e = (a - (s - v)) + (q - v);
  return s + (e + b);
}
float hash(vec2 p) { return fract(sinPrecise(dotHash(p)) * 43758.5); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float rfHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rfFilmGrain(vec2 px, vec3 col) {
  float t = floor(fract(u_grainT * 0.731) * 240.0);
  float n = rfHash12(floor(px / u_grainCell) + vec2(t * 17.0, t * 9.0));
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float resp = mix(0.35, 1.0, sstep(0.0, 0.22, luma)) * (1.0 - 0.8 * sstep(0.72, 1.0, luma));
  return (n - 0.5) * resp * 1.5;
}

vec3 toLab(vec3 c) {
  c = pow(max(c, 0.0), vec3(2.2));
  vec3 lms = pow(vec3(
    0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
    0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
    0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}
vec3 fromLab(vec3 L) {
  vec3 lms = vec3(
    L.x + 0.3963377774 * L.y + 0.2158037573 * L.z,
    L.x - 0.1055613458 * L.y - 0.0638541728 * L.z,
    L.x - 0.0894841775 * L.y - 1.2914855480 * L.z);
  lms = lms * lms * lms;
  vec3 c = vec3(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

vec3 blend(vec3 a, vec3 b, float t) {
  return fromLab(mix(toLab(a), toLab(b), t));
}

vec3 steps4(float g, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  if (g < 0.34) return c1;
  if (g < 0.57) return blend(c1, c2, sstep(0.34, 0.57, g));
  if (g < 0.59) return c2;
  if (g < 0.76) return blend(c2, c3, sstep(0.59, 0.76, g));
  if (g < 0.78) return c3;
  if (g < 0.93) return blend(c3, c4, sstep(0.78, 0.93, g));
  return c4;
}

vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }

vec3 fxPlasma(vec2 uv, float t, float warp, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  t *= 0.15;
  vec2 p = uv * 1.8;
  for (float i = 1.0; i <= 3.0; i += 1.0) {
    p.x += 0.16 * warp / i * sin(i * 1.7 * p.y + t * 0.9 + i * 0.3);
    p.y += 0.16 * warp / i * cos(i * 2.1 * p.x + t * 1.1 - i * 0.5);
  }
  float v = sin(p.x * 3.0 + t) + sin(p.y * 2.7 - t * 0.7) + sin((p.x + p.y) * 2.3 + t * 0.5);
  vec2 c = p - 0.9;
  v += sin(length(c) * 4.0 - t * 1.3);
  v += 0.7 * sin(p.x * 1.8 - p.y * 2.5 + t * 0.8) + 0.5 * sin(rot2(p, 0.7).x * 3.5 + t * 0.4);
  v = v / 5.2 * 0.5 + 0.5;
  float g = fract(v * 1.5);
  if (g > 0.88) return blend(c4, c1, sstep(0.88, 1.0, g));
  return steps4(g / 0.88, c1, c2, c3, c4);
}

vec3 fxLinear(vec2 uv, float t, float warp, float ang, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  t *= 0.15;
  vec2 p = uv;
  for (float i = 1.0; i <= 2.0; i += 1.0) {
    p.x += 0.12 * warp / i * sin(i * 5.1 * p.y + t * 0.9 + i * 0.3);
    p.y += 0.12 * warp / i * cos(i * 6.3 * p.x + t * 1.1 - i * 0.5);
  }
  float g = clamp((p.x - 0.5) * cos(ang) + (p.y - 0.5) * sin(ang) + 0.5, 0.0, 1.0);
  return steps4(g, c1, c2, c3, c4);
}

vec3 fxRadial(vec2 uv, float t, float warp, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  t *= 0.15;
  float g = clamp(length(uv - 0.5) * 2.0 / 1.2, 0.0, 1.0);
  float n = noise(uv * 3.0 + t * 0.4) + noise(uv * 2.5 - t * 0.3 + 50.0) - 1.0;
  return steps4(1.0 - clamp(g + n * 0.15 * warp * sstep(1.0, 0.6, g), 0.0, 1.0), c1, c2, c3, c4);
}

vec3 fxThermal(vec2 uv, float t, float warp, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  t *= 0.15;
  float light = 0.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float x = uv.x * (1.0 + fk * 0.4) + fk * 5.3;
    float mid = mix(0.62, 0.34, fk)
      + (mix(0.12, 0.08, fk) * sin(x * 2.0 + t * (0.8 + fk * 0.3) + fk * 2.0)
      + 0.04 * sin(x * 4.7 - t * 1.2 + fk)
      + 0.07 * (noise(vec2(x * 1.4, t * 0.3 + fk * 4.0)) - 0.5)) * warp;
    float thick = mix(0.13, 0.09, fk) * (0.75 + 0.5 * noise(vec2(x * 1.8 - t * 0.3, fk * 5.0)));
    float d = mid - uv.y;
    float ray = 0.75 + 0.5 * noise(vec2(x * 9.0 + t * 0.5, fk * 9.0));
    float up = thick * 1.6 * ray, down = thick * 0.7;
    float body = d > 0.0 ? exp(-pow(d / up, 1.6)) : exp(-pow(abs(d) / down, 2.0));
    float fold = 0.8 + 0.2 * noise(vec2(x * 2.2 - t * 0.4, fk * 6.0));
    light = 1.0 - (1.0 - light) * (1.0 - clamp(body * fold * mix(1.0, 0.6, fk), 0.0, 1.0));
  }
  return steps4(light, c1, c2, c3, c4);
}

float topoFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { p = rot2(p, 0.6); v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
vec3 fxTopo(vec2 uv, float t, float warp, vec3 line, vec3 fillC, vec3 ground) {
  t *= 0.15;
  vec2 p = uv * 1.6;
  p += vec2(topoFbm(p + t * 0.3), topoFbm(p + vec2(5.2, 1.3) + t * 0.2)) * 0.3 * warp;
  float e = topoFbm(p + t * 0.1), se = e * 6.0;
  float ld = min(fract(se), 1.0 - fract(se));
  // The line's edge is 0.1 of a contour wide, the original's; where a pixel
  // spans more than that it is as wide as the pixel, and where it spans
  // several contours it is their mean coverage.
  float w = max(0.1, fwidth(se));
  float l = 1.0 - sstep(0.09 - 0.5 * w, 0.09 + 0.5 * w, ld);
  l = mix(l, 0.18, sstep(0.5, 1.0, w));
  vec3 fill = mix(ground, fillC, e * 0.6);
  return mix(fill, line, l);
}

vec3 effect(vec2 uv, vec2 ua) {
  if (u_fx < 0.5) return fxLinear(uv, u_t, u_warp, u_angle, u_col1, u_col2, u_col3, u_col4);
  if (u_fx < 1.5) return fxThermal(ua, u_t, u_warp, u_col1, u_col2, u_col3, u_col4);
  if (u_fx < 2.5) return fxTopo(uv, u_t, u_warp, u_col1, u_col2, u_col3);
  if (u_fx < 3.5) return fxPlasma(uv, u_t, u_warp, u_col1, u_col2, u_col3, u_col4);
  return fxRadial(uv, u_t, u_warp, u_col1, u_col2, u_col3, u_col4);
}

void main() {
  // Pixels from the tile's top left, as the original's canvas and the phone count them.
  vec2 px = vec2(gl_FragCoord.x - u_origin.x, u_size - (gl_FragCoord.y - u_origin.y));
  float r = u_size * 0.5;
  vec2 uv = (px - r) / (r * 2.0 * u_scale) + 0.5;
  // Each seed sees its own part of the pattern. Thermal only slides
  // sideways and zooms, so it stays upright.
  vec2 ua = (uv - 0.5) / u_layout.w + 0.5 + vec2(u_layout.x, 0.0);
  uv = rot2(uv - 0.5, u_layout.z) / u_layout.w + 0.5 + u_layout.xy;
  vec3 c = effect(uv, ua);
  c += rfFilmGrain(px, c) * u_grain;
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
