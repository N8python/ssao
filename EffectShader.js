import * as THREE from 'https://cdn.skypack.dev/three@0.142.0';
const EffectShader = {

    uniforms: {

        'sceneDiffuse': { value: null },
        'sceneDepth': { value: null },
        'projMat': { value: new THREE.Matrix4() },
        'viewMat': { value: new THREE.Matrix4() },
        'projViewMat': { value: new THREE.Matrix4() },
        'projectionMatrixInv': { value: new THREE.Matrix4() },
        'viewMatrixInv': { value: new THREE.Matrix4() },
        'cameraPos': { value: new THREE.Vector3() },
        'resolution': { value: new THREE.Vector2() },
        'time': { value: 0.0 },
        'samples': { value: [] },
        'samplesR': { value: [] },
        'bluenoise': { value: null },
        'radius': { value: 5.0 }
    },

    vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,

    fragmentShader: /* glsl */ `
    #define SAMPLES 16
    #define FSAMPLES 16.0
uniform sampler2D sceneDiffuse;
uniform sampler2D sceneDepth;
uniform mat4 projectionMatrixInv;
uniform mat4 viewMatrixInv;
uniform mat4 projMat;
uniform mat4 viewMat;
uniform mat4 projViewMat;
uniform vec3 cameraPos;
uniform vec2 resolution;
uniform float time;
uniform vec3[SAMPLES] samples;
uniform float[SAMPLES] samplesR;
uniform float radius;
uniform sampler2D bluenoise;
    varying vec2 vUv;
    highp float linearize_depth(highp float d, highp float zNear,highp float zFar)
    {
        highp float z_n = 2.0 * d - 1.0;
        return 2.0 * zNear * zFar / (zFar + zNear - z_n * (zFar - zNear));
    }
    vec3 getWorldPos(float depth, vec2 coord) {
      float z = depth * 2.0 - 1.0;
      vec4 clipSpacePosition = vec4(coord * 2.0 - 1.0, z, 1.0);
      vec4 viewSpacePosition = projectionMatrixInv * clipSpacePosition;
      // Perspective division
     vec4 worldSpacePosition = viewMatrixInv * viewSpacePosition;
     worldSpacePosition.xyz /= worldSpacePosition.w;
      return worldSpacePosition.xyz;
  }
  vec3 computeNormal(vec3 worldPos, vec2 vUv) {
      vec2 downUv = vUv + vec2(0.0, 1.0 / resolution.y);
      vec3 downPos = getWorldPos( texture2D(sceneDepth, downUv).x, downUv).xyz;
      vec2 rightUv = vUv + vec2(1.0 / resolution.x, 0.0);
      vec3 rightPos = getWorldPos(texture2D(sceneDepth, rightUv).x, rightUv).xyz;
      vec2 upUv = vUv - vec2(0.0, 1.0 / resolution.y);
      vec3 upPos = getWorldPos(texture2D(sceneDepth, upUv).x, upUv).xyz;
      vec2 leftUv = vUv - vec2(1.0 / resolution.x, 0.0);;
      vec3 leftPos = getWorldPos(texture2D(sceneDepth, leftUv).x, leftUv).xyz;
      int hChoice;
      int vChoice;
      if (length(leftPos - worldPos) < length(rightPos - worldPos)) {
        hChoice = 0;
      } else {
        hChoice = 1;
      }
      if (length(upPos - worldPos) < length(downPos - worldPos)) {
        vChoice = 0;
      } else {
        vChoice = 1;
      }
      vec3 hVec;
      vec3 vVec;
      if (hChoice == 0 && vChoice == 0) {
        hVec = leftPos - worldPos;
        vVec = upPos - worldPos;
      } else if (hChoice == 0 && vChoice == 1) {
        hVec = leftPos - worldPos;
        vVec = worldPos - downPos;
      } else if (hChoice == 1 && vChoice == 1) {
        hVec = rightPos - worldPos;
        vVec = downPos - worldPos;
      } else if (hChoice == 1 && vChoice == 0) {
        hVec = rightPos - worldPos;
        vVec = worldPos - upPos;
      }
      return normalize(cross(hVec, vVec));
    }
  float rand(float n){return fract(sin(n) * 43758.5453123);}
  float rand(vec2 n) { 
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
  }
  
float noise(float p){
float fl = floor(p);
float fc = fract(p);
return mix(rand(fl), rand(fl + 1.0), fc);
}

float noise(vec2 n) {
const vec2 d = vec2(0.0, 1.0);
vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

float seed = 0.0;
uint hash( uint x ) {
  x += ( x << 10u );
  x ^= ( x >>  6u );
  x += ( x <<  3u );
  x ^= ( x >> 11u );
  x += ( x << 15u );
  return x;
}



// Compound versions of the hashing algorithm I whipped together.
uint hash( uvec2 v ) { return hash( v.x ^ hash(v.y)                         ); }
uint hash( uvec3 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z)             ); }
uint hash( uvec4 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z) ^ hash(v.w) ); }



// Construct a float with half-open range [0:1] using low 23 bits.
// All zeroes yields 0.0, all ones yields the next smallest representable value below 1.0.
float floatConstruct( uint m ) {
  const uint ieeeMantissa = 0x007FFFFFu; // binary32 mantissa bitmask
  const uint ieeeOne      = 0x3F800000u; // 1.0 in IEEE binary32

  m &= ieeeMantissa;                     // Keep only mantissa bits (fractional part)
  m |= ieeeOne;                          // Add fractional part to 1.0

  float  f = uintBitsToFloat( m );       // Range [1:2]
  return f - 1.0;                        // Range [0:1]
}



// Pseudo-random value in half-open range [0:1].
float random( float x ) { return floatConstruct(hash(floatBitsToUint(x))); }
float random( vec2  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec3  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec4  v ) { return floatConstruct(hash(floatBitsToUint(v))); }

float rand()
{
/*float result = fract(sin(seed + mod(time, 1000.0) + dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
//_Seed += 1.0;
seed += 1.0;
return result;*/
float result = random(vec4(gl_FragCoord.xy, seed, time));
seed += 1.0;
return result;
}
void main() {
      vec4 diffuse = texture2D(sceneDiffuse, vUv);
      float depth = texture2D(sceneDepth, vUv).x;
      if (depth == 1.0) {
        gl_FragColor = vec4(vec3(1.0), 1.0);
        return;
      }
      vec3 worldPos = getWorldPos(depth, vUv);
      vec3 normal = computeNormal(worldPos, vUv);
      vec4 noise = texture2D(bluenoise, vUv * (resolution / vec2(1024.0, 1024.0)));
      float occluded = 0.0;
      float z = linearize_depth(texture2D(sceneDepth, vUv).x, 0.1, 1000.0);
      for(float i = 0.0; i < FSAMPLES; i++) {
        vec3 sampleDirection = reflect(samples[int(i)], normalize(noise.rgb));
        if (dot(normal, sampleDirection) < 0.0) {
          sampleDirection *= -1.0;
        }
        float moveAmt = samplesR[int(mod(i + noise.a * FSAMPLES, FSAMPLES))];
        vec3 samplePos = worldPos + radius * moveAmt * sampleDirection;
        vec4 offset = projViewMat * vec4(samplePos, 1.0);
        offset.xyz /= offset.w;
        offset.xyz = offset.xyz * 0.5 + 0.5;
        float sampleDepth = texture2D(sceneDepth, offset.xy).x;
        float distSample = linearize_depth(sampleDepth, 0.1, 1000.0);
        float distWorld = linearize_depth(offset.z, 0.1, 1000.0);
        float rangeCheck = smoothstep(0.0, 1.0, radius / (radius * abs(distSample - distWorld)));
        if (distSample < distWorld) {
          occluded += rangeCheck * dot(sampleDirection, normal);
        }

      }
      float occ = clamp(1.0 - occluded / FSAMPLES, 0.0, 1.0);
      gl_FragColor = vec4(0.5 + 0.5 * normal, occ);
}`


};

export { EffectShader };