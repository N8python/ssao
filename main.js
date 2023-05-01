import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.137.0-X5O2PK3x44y1WRry67Kr/mode=imports/optimized/three.js';
import { EffectComposer } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/SMAAPass.js';
import { GammaCorrectionShader } from 'https://unpkg.com/three@0.137.0/examples/jsm/shaders/GammaCorrectionShader.js';
import { EffectShader } from "./EffectShader.js";
import { EffectCompositer } from "./EffectCompositer.js";
import { OrbitControls } from 'https://unpkg.com/three@0.137.0/examples/jsm/controls/OrbitControls.js';
import { AssetManager } from './AssetManager.js';
import { Stats } from "./stats.js";
import { VerticalBlurShader } from './VerticalBlurShader.js';
import { HorizontalBlurShader } from './HorizontalBlurShader.js';
import { PoissionBlur } from './PoissionBlur.js';
import { GUI } from 'https://unpkg.com/three@0.142.0/examples/jsm/libs/lil-gui.module.min.js';
async function main() {
    // Setup basic renderer, controls, and profiler
    let clientWidth = window.innerWidth;
    let clientHeight = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    camera.position.set(50, 75, 50);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(clientWidth, clientHeight);
    document.body.appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 25, 0);
    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);
    // Setup scene
    // Skybox
    const environment = new THREE.CubeTextureLoader().load([
        "skybox/Box_Right.bmp",
        "skybox/Box_Left.bmp",
        "skybox/Box_Top.bmp",
        "skybox/Box_Bottom.bmp",
        "skybox/Box_Front.bmp",
        "skybox/Box_Back.bmp"
    ]);
    scene.background = environment;
    // Lighting
    const ambientLight = new THREE.AmbientLight(new THREE.Color(1.0, 1.0, 1.0), 0.25);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.35);
    directionalLight.position.set(150, 200, 50);
    // Shadows
    //directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.left = -75;
    directionalLight.shadow.camera.right = 75;
    directionalLight.shadow.camera.top = 75;
    directionalLight.shadow.camera.bottom = -75;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.blurSamples = 8;
    directionalLight.shadow.radius = 4;
    scene.add(directionalLight);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.15);
    directionalLight2.color.setRGB(1.0, 1.0, 1.0);
    directionalLight2.position.set(-50, 200, -150);
    scene.add(directionalLight2);
    // Objects
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100).applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    ground.castShadow = true;
    ground.receiveShadow = true;
    //scene.add(ground);
    const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: new THREE.Color(1.0, 0.0, 0.0) }));
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.y = 5.01;
    //scene.add(box);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(6.25, 32, 32), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: environment, metalness: 1.0, roughness: 0.25 }));
    sphere.position.y = 5.01;
    sphere.position.x = 25;
    sphere.position.z = 25;
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    //scene.add(sphere);
    const torusKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(5, 1.5, 200, 32), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: environment, metalness: 0.5, roughness: 0.5, color: new THREE.Color(0.0, 1.0, 0.0) }));
    torusKnot.position.y = 3;
    torusKnot.position.x = 0;
    torusKnot.position.z = 0;
    torusKnot.castShadow = true;
    torusKnot.receiveShadow = true;
    scene.add(torusKnot);
    const sponza = (await AssetManager.loadGLTFAsync("sponza.glb")).scene;
    sponza.traverse(object => {
        if (object.material) {
            object.material.envMap = environment;
        }
    })
    sponza.scale.set(10, 10, 10)
    scene.add(sponza);
    // Build postprocessing stack
    // Render Targets
    let timeSamples = 0;
    let runningTime = 0;
    const effectController = {
        aoSamples: 16.0,
        denoiseSamples: 4.0,
        denoiseRadius: 12.0,
        aoRadius: 5.0,
        intensity: 5.0,
        renderMode: "Combined"
    };
    const gui = new GUI();
    gui.add(effectController, "aoSamples", 1.0, 64.0, 1.0).onChange(val => {
        timeSamples = 0;
        const e = {...EffectShader };
        e.fragmentShader = e.fragmentShader.replace("16", effectController.aoSamples).replace("16.0", effectController.aoSamples + ".0");
        effectPass.material.dispose();
        effectPass = new ShaderPass(e);
        composer.passes[0] = effectPass;
        samples = getPointsOnHemisphere(effectController.aoSamples);
        samplesR = [];
        for (let i = 0; i < effectController.aoSamples; i++) {
            samplesR.push((i + 1) / effectController.aoSamples);
        }
    })
    gui.add(effectController, "denoiseSamples", 1.0, 64.0, 1.0).onChange(val => {
        timeSamples = 0;
        const p = {...PoissionBlur };
        p.fragmentShader = p.fragmentShader.replace("16", val);
        blurPass.material.dispose();
        blurPass2.material.dispose();
        blurPass = new ShaderPass(p);
        blurPass2 = new ShaderPass(p);
        blurs = [blurPass, blurPass2];
        composer.passes[1] = blurPass;
        composer.passes[2] = blurPass2;
    });
    gui.add(effectController, "denoiseRadius", 0.0, 24.0, 0.01).onChange(val => {
        timeSamples = 0;
    });
    gui.add(effectController, "aoRadius", 1.0, 10.0, 0.01).onChange(val => {
        timeSamples = 0;
    });
    gui.add(effectController, "intensity", 0.0, 10.0, 0.01);
    gui.add(effectController, "renderMode", ["Combined", "AO", "No AO", "Split", "Split AO"]);
    const defaultTexture = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter
    });
    defaultTexture.depthTexture = new THREE.DepthTexture(clientWidth, clientHeight, THREE.UnsignedIntType);
    defaultTexture.depthTexture.format = THREE.DepthFormat;
    // Post Effects
    const composer = new EffectComposer(renderer);
    const smaaPass = new SMAAPass(clientWidth, clientHeight);
    const e = {...EffectShader };
    e.fragmentShader = e.fragmentShader.replace("16", effectController.aoSamples).replace("16.0", effectController.aoSamples + ".0");
    let effectPass = new ShaderPass(e);
    const effectCompositer = new ShaderPass(EffectCompositer);
    /*const blurs = [];
    for (let i = 0; i < 3; i++) {
        const hblur = new ShaderPass(HorizontalBlurShader);
        const vblur = new ShaderPass(VerticalBlurShader);
        const blurSize = 1.0;
        hblur.uniforms.h.value = 2 ** i;
        vblur.uniforms.v.value = 2 ** i;
        blurs.push([hblur, vblur]);
    }*/
    composer.addPass(effectPass);
    /* for (const [hblur, vblur] of blurs) {
         composer.addPass(hblur);
         composer.addPass(vblur)
     }*/
    const p = {...PoissionBlur }; //.replace("16", effectController.denoiseSamples)
    p.fragmentShader = p.fragmentShader.replace("16", effectController.denoiseSamples);
    let blurPass = new ShaderPass(p);
    let blurPass2 = new ShaderPass(p);
    let blurs = [blurPass, blurPass2];
    composer.addPass(blurPass);
    composer.addPass(blurPass2);
    composer.addPass(effectCompositer);
    composer.addPass(new ShaderPass(GammaCorrectionShader));
    composer.addPass(smaaPass);
    // Add resize support
    window.addEventListener("resize", () => {
        timeSamples = 0;
        clientWidth = window.innerWidth;
        clientHeight = window.innerHeight;
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight);
        composer.setSize(clientWidth, clientHeight);
        defaultTexture.setSize(clientWidth, clientHeight);
    });
    // Write a function to get n evenly spaced points on a sphere

    function getPointsOnHemisphere(n) {
        const points = [];
        for (let k = 0; k < n; k++) {
            const theta = 2.399963 * k;
            const r = (Math.sqrt(k + 0.5) / Math.sqrt(n));
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            // Project to hemisphere
            const z = Math.sqrt(1 - (x * x + y * y));
            points.push(new THREE.Vector3(x, y, z));

        }
        return points;
    }
    let samples = getPointsOnHemisphere(effectController.aoSamples); //[];

    for (let i = 0; i < 16; i++) {
        const rep = samples[i];
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: environment, metalness: 0.5, roughness: 0.5, color: new THREE.Color(0.0, 1.0, 0.0) }));
        mesh.position.set(rep.x * 10, rep.z * 10 + 10, rep.y * 10);
        scene.add(mesh);
    }
    /*for (let i = 0; i < 16; i++) {
        samples.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize());
    }*/
    let samplesR = [];
    for (let i = 0; i < effectController.aoSamples; i++) {
        samplesR.push((i + 1) / effectController.aoSamples);
    }
    const bluenoise = await new THREE.TextureLoader().loadAsync("bluenoise.png");
    bluenoise.wrapS = THREE.RepeatWrapping;
    bluenoise.wrapT = THREE.RepeatWrapping;
    bluenoise.minFilter = THREE.NearestFilter;
    bluenoise.magFilter = THREE.NearestFilter;
    const gl = renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');


    const timerDOM = document.getElementById("aoTime");
    effectCompositer.fsQuad._mesh.onAfterRender = () => {
        gl.endQuery(ext.TIME_ELAPSED_EXT);

    }

    function checkTimerQuery(timerQuery) {
        const available = gl.getQueryParameter(timerQuery, gl.QUERY_RESULT_AVAILABLE);
        if (available) {
            const elapsedTimeInNs = gl.getQueryParameter(timerQuery, gl.QUERY_RESULT);
            const elapsedTimeInMs = elapsedTimeInNs / 1000000;
            timeSamples++;
            const factor = 1.0 / timeSamples;
            runningTime = runningTime * (1 - factor) + elapsedTimeInMs * factor;
            timerDOM.innerText = runningTime.toFixed(2);
        } else {
            // If the result is not available yet, check again after a delay
            setTimeout(() => {
                checkTimerQuery(timerQuery);
            }, 1);
        }
    }
    const aoMeta = document.getElementById("aoMetadata");

    function animate() {
        aoMeta.innerHTML = `${clientWidth}x${clientHeight}`
            //torusKnot.rotation.x += 0.033;
            // torusKnot.rotation.y += 0.033;
        renderer.setRenderTarget(defaultTexture);
        renderer.render(scene, camera);
        /* blurs.forEach(([hblur, vblur], i) => {
             const blurSize = 4.0 ** (i);
             hblur.uniforms["sceneDepth"].value = defaultTexture.depthTexture;
             hblur.uniforms["resolution"].value = new THREE.Vector2(clientWidth, clientHeight);
             vblur.uniforms["sceneDepth"].value = defaultTexture.depthTexture;
             vblur.uniforms["resolution"].value = new THREE.Vector2(clientWidth, clientHeight);
             hblur.uniforms.h.value = blurSize;
             vblur.uniforms.v.value = blurSize;
         });*/
        effectCompositer.uniforms["sceneDiffuse"].value = defaultTexture.texture;
        effectCompositer.uniforms["sceneDepth"].value = defaultTexture.depthTexture;
        effectPass.uniforms["sceneDiffuse"].value = defaultTexture.texture;
        effectPass.uniforms["sceneDepth"].value = defaultTexture.depthTexture;
        camera.updateMatrixWorld();
        effectPass.uniforms["projMat"].value = camera.projectionMatrix;
        effectPass.uniforms["viewMat"].value = camera.matrixWorldInverse;
        effectPass.uniforms["projViewMat"].value = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse.clone());
        effectPass.uniforms["projectionMatrixInv"].value = camera.projectionMatrixInverse;
        effectPass.uniforms["viewMatrixInv"].value = camera.matrixWorld;
        effectPass.uniforms["cameraPos"].value = camera.position;
        effectPass.uniforms['resolution'].value = new THREE.Vector2(clientWidth, clientHeight);
        effectPass.uniforms['time'].value = performance.now() / 1000;
        effectPass.uniforms['samples'].value = samples;
        effectPass.uniforms['samplesR'].value = samplesR;
        effectPass.uniforms['bluenoise'].value = bluenoise;
        effectPass.uniforms['radius'].value = effectController.aoRadius;
        effectCompositer.uniforms["resolution"].value = new THREE.Vector2(clientWidth, clientHeight);
        effectCompositer.uniforms["blueNoise"].value = bluenoise;
        effectCompositer.uniforms["intensity"].value = effectController.intensity;
        effectCompositer.uniforms["renderMode"].value = ["Combined", "AO", "No AO", "Split", "Split AO"].indexOf(effectController.renderMode);
        blurs.forEach((b, i) => {
            b.uniforms["sceneDepth"].value = defaultTexture.depthTexture;
            b.uniforms["projMat"].value = camera.projectionMatrix;
            b.uniforms["viewMat"].value = camera.matrixWorldInverse;
            b.uniforms["projectionMatrixInv"].value = camera.projectionMatrixInverse;
            b.uniforms["viewMatrixInv"].value = camera.matrixWorld;
            b.uniforms["cameraPos"].value = camera.position;
            b.uniforms['resolution'].value = new THREE.Vector2(clientWidth, clientHeight);
            b.uniforms['time'].value = performance.now() / 1000;
            b.uniforms['blueNoise'].value = bluenoise;
            b.uniforms['radius'].value = effectController.denoiseRadius;
            b.uniforms['index'].value = i;
        })
        const timerQuery = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, timerQuery);
        composer.render();
        checkTimerQuery(timerQuery);
        controls.update();
        stats.update();
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}
main();