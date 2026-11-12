/*!
 * Powered by Paper Shaders: https://shaders.paper.design
 * https://github.com/paper-design/shaders
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Paper's Liquid Metal, packages/shaders/src/shaders/liquid-metal.ts at
 * e7003a2 (@paper-design/shaders 0.0.82), with simplexNoise, rotation2 and
 * colorBandingFix from shader-utils.ts and the image sizing from
 * vertex-shader.ts. The same port as slopus/happy's
 * packages/happy-ios/Sources/HappyUI/Start/LiquidMetalView.swift and
 * packages/happy-android/app/src/main/kotlin/com/slopus/happy/ui/start/LiquidMetal.kt.
 * Changes: only an image mask, with Paper's default preset (fit contain,
 * scale 1, speed 1, repetition 2, softness .1, shiftRed .3, shiftBlue .3,
 * distortion .07, contour .4, angle 70) fixed in the source and a transparent
 * background; the mask's edge field, which never moves, baked ahead of time
 * by slopus/happy's scripts/liquid-metal/cloud.py (Paper's Poisson solve,
 * blurEdge3x3 and pow 1.6) into cloud-liquid-metal.png, red the edge and
 * green the alpha, so a frame reads it once rather than nine times; the
 * banding dither scaled by the mark's opacity, so the square stays clear.
 */
export const liquidMetalVertexShader = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0., 1.); }
`;

export const liquidMetalFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_time;

out vec4 fragColor;

#define PI 3.14159265358979323846

const float REPETITION = 2.;
const float SOFTNESS = .1;
const float SHIFT_RED = .3;
const float SHIFT_BLUE = .3;
const float DISTORTION = .07;
const float CONTOUR = .4;
const float ANGLE = 70.;
// colorTint white at full strength: color burn by white changes nothing.
const vec3 TINT = vec3(1.);
const float TINT_ALPHA = 1.;

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float getColorChanges(float c1, float c2, float stripe_p, vec3 w, float blur, float bump, float tint) {
  float ch = mix(c2, c1, smoothstep(.0, 2. * blur, stripe_p));

  float border = w[0];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  bump = smoothstep(.2, .8, bump);
  border = w[0] + .4 * (1. - bump) * w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .5 * (1. - bump) * w[1];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
  float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
  ch = mix(ch, gradient, smoothstep(border, border + .5 * blur, stripe_p));

  // Tint color is applied with color burn blending
  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), TINT_ALPHA);
  return ch;
}

void main() {
  const float firstFrameOffset = 2.8;
  float t = .3 * (u_time + firstFrameOffset);

  // v_imageUV for a square image, fit contain, scale 1: the shorter side's
  // square, centred, y down (WebGL's fragment y is up).
  vec2 fragCoord = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float side = min(u_resolution.x, u_resolution.y);
  vec2 uv = (fragCoord - .5 * u_resolution) / side + .5;
  vec4 img = texture(u_image, uv);

  float cycleWidth = REPETITION;

  vec2 rotatedUV = uv - vec2(.5);
  float angle = (-ANGLE + 70.) * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  rotatedUV = vec2(
  rotatedUV.x * cosA - rotatedUV.y * sinA,
  rotatedUV.x * sinA + rotatedUV.y * cosA
  ) + vec2(.5);

  // blurEdge3x3 and pow(edge, 1.6) are baked into the field's red.
  float edge = img.r;
  edge *= mix(0.0, 1.0, smoothstep(0.0, 0.4, CONTOUR));

  // getImgFrame(v_imageUV, 0.): nothing outside the image's square.
  float opacity = img.g * step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);

  float diagBLtoTR = rotatedUV.x - rotatedUV.y;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y;

  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));

  vec2 grad_uv = uv - .5;

  float dist = length(grad_uv + vec2(0., .2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (.25 - .2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  float bump = pow(1.8 * dist, 1.2);
  bump = 1. - bump;
  bump *= pow(max(uv.y, 0.), .3);

  float thin_strip_1_ratio = .12 / cycleWidth * (1. - .4 * bump);
  float thin_strip_2_ratio = .07 / cycleWidth * (1. + .4 * bump);
  float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  float noise = snoise(uv - t);

  edge += (1. - edge) * DISTORTION * noise;

  direction += diagBLtoTR;
  direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));
  // u_contour range 2
  direction *= mix(1., 1. - edge, smoothstep(.5, 1., CONTOUR));
  direction -= 1.7 * edge * smoothstep(.5, 1., CONTOUR);
  direction += .2 * pow(CONTOUR, 4.) * (1.0 - smoothstep(0., 1., edge));

  bump *= clamp(pow(max(uv.y, 0.), .1), .3, 1.);
  direction *= (.1 + (1.1 - edge) * bump);

  direction *= (.4 + .6 * (1.0 - smoothstep(.5, 1., edge)));
  direction += .18 * (smoothstep(.1, .2, uv.y) * (1.0 - smoothstep(.2, .4, uv.y)));
  direction += .03 * (smoothstep(.1, .2, 1. - uv.y) * (1.0 - smoothstep(.2, .4, 1. - uv.y)));

  direction *= (.5 + .5 * pow(uv.y, 2.));
  direction *= cycleWidth;
  direction -= t;

  float colorDispersion = (1. - bump);
  colorDispersion = clamp(colorDispersion, 0., 1.);
  float dispersionRed = colorDispersion;
  dispersionRed += .03 * bump * noise;
  dispersionRed += 5. * (smoothstep(-.1, .2, uv.y) * (1.0 - smoothstep(.1, .5, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, 1., bump)));
  dispersionRed -= diagBLtoTR;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0., .4, uv.y) * (1.0 - smoothstep(.1, .8, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, .8, bump)));
  dispersionBlue -= .2 * edge;

  dispersionRed *= (SHIFT_RED / 20.);
  dispersionBlue *= (SHIFT_BLUE / 20.);

  float softness = 0.05 * SOFTNESS;
  float blur = softness + .5 * smoothstep(1., 10., REPETITION) * smoothstep(.0, 1., edge);
  float smallCanvasT = 1.0 - smoothstep(100., 500., min(u_resolution.x, u_resolution.y));
  blur += smallCanvasT * smoothstep(.0, 1., edge);
  float rExtraBlur = softness * (0.05 + .1 * (SHIFT_RED / 20.) * bump);
  float gExtraBlur = softness * 0.05 / max(0.001, abs(1. - diagBLtoTR));

  vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w[1] -= .02 * smoothstep(.0, 1., edge + bump);
  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + fwidth(stripe_r) + rExtraBlur, bump, TINT.r);
  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + fwidth(stripe_g) + gExtraBlur, bump, TINT.g);
  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + fwidth(stripe_b), bump, TINT.b);

  vec3 color = vec3(r, g, b);
  color *= opacity;

  color += opacity / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);

  fragColor = vec4(color, opacity);
}
`;
