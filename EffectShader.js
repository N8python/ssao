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
    float linearizeDepth(float depth, float near, float far) {
      float zLinear = (2.0 * near) / (far + near - depth * (far - near));
      return zLinear;
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
    ivec2 p = ivec2(vUv * resolution);
    float c0 = texelFetch(sceneDepth, p, 0).x;
    float l2 = texelFetch(sceneDepth, p - ivec2(2, 0), 0).x;
    float l1 = texelFetch(sceneDepth, p - ivec2(1, 0), 0).x;
    float r1 = texelFetch(sceneDepth, p + ivec2(1, 0), 0).x;
    float r2 = texelFetch(sceneDepth, p + ivec2(2, 0), 0).x;
    float b2 = texelFetch(sceneDepth, p - ivec2(0, 2), 0).x;
    float b1 = texelFetch(sceneDepth, p - ivec2(0, 1), 0).x;
    float t1 = texelFetch(sceneDepth, p + ivec2(0, 1), 0).x;
    float t2 = texelFetch(sceneDepth, p + ivec2(0, 2), 0).x;

    float dl = abs((2.0 * l1 - l2) - c0);
    float dr = abs((2.0 * r1 - r2) - c0);
    float db = abs((2.0 * b1 - b2) - c0);
    float dt = abs((2.0 * t1 - t2) - c0);

    vec3 ce = getWorldPos(c0, vUv).xyz;

    vec3 dpdx = (dl < dr) ? ce - getWorldPos(l1, (vUv - vec2(1.0 / resolution.x, 0.0))).xyz
                          : -ce + getWorldPos(r1, (vUv + vec2(1.0 / resolution.x, 0.0))).xyz;
    vec3 dpdy = (db < dt) ? ce - getWorldPos(b1, (vUv - vec2(0.0, 1.0 / resolution.y))).xyz
                          : -ce + getWorldPos(t1, (vUv + vec2(0.0, 1.0 / resolution.y))).xyz;

    return normalize(cross(dpdx, dpdy));
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
          occluded += rangeCheck * weight * (distSample < distWorld ? 1.0 : 0.0);
          totalWeight += weight;

       // }

      }
      float occ = clamp(1.0 - occluded / totalWeight, 0.0, 1.0);
      gl_FragColor = vec4(0.5 + 0.5 * normal, occ);
}`


};

export { EffectShader };