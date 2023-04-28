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
uniform highp sampler2D sceneDepth;
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
      vec3 randomVec = normalize(noise.rgb * 2.0 - 1.0);
      vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
      vec3 bitangent = cross(normal, tangent);
      mat3 tbn = mat3(tangent, bitangent, normal);
      float occluded = 0.0;
      float totalWeight = 0.0;
      float z = linearize_depth(texture2D(sceneDepth, vUv).x, 0.1, 1000.0);
      for(float i = 0.0; i < FSAMPLES; i++) {
        vec3 sampleDirection = 
        tbn * 
        samples[int(i)];
        ;//reflect(samples[int(i)], randomVec);// * sign(dot(normal, samples[int(i)]));
      //  sampleDirection *= (dot(normal, sampleDirection) < 0.0 ? -1.0 : 1.0);

        float moveAmt = samplesR[int(mod(i + noise.a * FSAMPLES, FSAMPLES))];
        vec3 samplePos = worldPos + radius * moveAmt * sampleDirection;
        vec4 offset = projViewMat * vec4(samplePos, 1.0);
        offset.xyz /= offset.w;
        offset.xyz = offset.xyz * 0.5 + 0.5;
        float sampleDepth = textureLod(sceneDepth, offset.xy, 0.0).x;
        float distSample = linearize_depth(sampleDepth, 0.1, 1000.0);
        float distWorld = linearize_depth(offset.z, 0.1, 1000.0);
        float rangeCheck = smoothstep(0.0, 1.0, radius / (radius * abs(distSample - distWorld)));
        float weight = dot(sampleDirection, normal);
        //if (distSample < distWorld) {
          occluded += rangeCheck * weight /** dot(sampleDirection, normal)*/ * (distSample < distWorld ? 1.0 : 0.0);
          totalWeight += weight;

       // }

      }
      float occ = clamp(1.0 - occluded / totalWeight, 0.0, 1.0);
      gl_FragColor = vec4(0.5 + 0.5 * normal, occ);
}`


};

export { EffectShader };