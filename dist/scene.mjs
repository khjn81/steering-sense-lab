import { frontWheelAngles, projectedPath, vehiclePoint, WHEELBASE } from './simulation.mjs';
import { getScenario, obstaclesFor, rectangleCorners } from './scenarios.mjs?v=4';

export async function createScene(container, onFallback = () => {}) {
  let current, disposed = false;
  try {
    const THREE = await import('./vendor/three/three.module.js');
    current = threeScene(container, THREE, () => {
      if (disposed) return;
      current.dispose(); current = flatScene(container); onFallback();
    });
  } catch (error) {
    console.warn('3D view unavailable; using the top view.', error);
    current = flatScene(container);
  }
  return { get kind() { return current.kind; }, render(state) { if (!disposed) current.render(state); }, setView(view) { if (!disposed) current.setView(view); }, dispose() { if (disposed) return; disposed = true; current.dispose(); } };
}

function disposeObjects(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry && !object.isSprite) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue; materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

function threeScene(container, T, onContextLoss) {
  let disposed = false;
  const scene = new T.Scene();
  scene.background = new T.Color('#e8eee5');
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .85;
  renderer.autoClear = false;
  renderer.setClearColor('#e8eee5');
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.prepend(renderer.domElement);
  const camera = new T.OrthographicCamera(-10, 10, 6, -6, .1, 100);
  const ambient = new T.HemisphereLight('#fffdf0', '#79917b', 1.2); scene.add(ambient);
  const sun = new T.DirectionalLight('#fffaf0', 1.7);
  sun.position.set(-7, 14, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 40 });
  sun.shadow.normalBias = .03; sun.shadow.bias = -.0001;
  scene.add(sun);
  const material = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .72, ...extra });
  const outdoor = new T.Group(); scene.add(outdoor);
  const ground = new T.Mesh(new T.PlaneGeometry(70, 70), material('#e2eadf'));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.025; ground.receiveShadow = true; outdoor.add(ground);
  const grid = new T.GridHelper(60, 60, '#cfdaca', '#d6e0d0'); grid.position.y = -.013; outdoor.add(grid);
  function simpleLine(points, color, opacity = 1) {
    const g = new T.BufferGeometry().setFromPoints(points.map(([x, z]) => new T.Vector3(x, .008, z)));
    const l = new T.Line(g, new T.LineBasicMaterial({ color, transparent: true, opacity })); outdoor.add(l); return l;
  }
  for (const x of [-7.5, 7.5]) for (const z of [-8, -4, 0, 4]) simpleLine([[x, z], [x + (x < 0 ? 2.7 : -2.7), z], [x + (x < 0 ? 2.7 : -2.7), z + 3.6], [x, z + 3.6]], '#fbfcf5', .95);
  const centerLine = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, .012, -9), new T.Vector3(0, .012, 9)]), new T.LineDashedMaterial({ color: '#bac9b1', dashSize: .24, gapSize: .22, transparent: true, opacity: .6 }));
  centerLine.computeLineDistances(); outdoor.add(centerLine);
  const coneMat = material('#d49c71');
  for (const [x, z] of [[-9, -8], [9, -8], [-9, 7.7], [9, 7.7]]) {
    const cone = new T.Group();
    const base = new T.Mesh(new T.BoxGeometry(.5, .06, .5), material('#c7cfb6')); base.position.y = .03;
    const top = new T.Mesh(new T.ConeGeometry(.19, .58, 20), coneMat); top.position.y = .35; top.castShadow = true;
    const stripe = new T.Mesh(new T.CylinderGeometry(.105, .135, .09, 20), material('#fff9e6')); stripe.position.y = .35;
    cone.add(base, top, stripe); cone.position.set(x, 0, z); outdoor.add(cone);
  }
  for (const [x, z] of [[-10, -6], [-10, 1], [10, -3], [10, 6]]) {
    const tree = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(.1, .13, .9, 7), material('#a2b298')); trunk.position.y = .45;
    const crown = new T.Mesh(new T.IcosahedronGeometry(.85, 1), material('#a9be9b')); crown.position.y = 1.35; crown.castShadow = true;
    tree.add(trunk, crown); tree.position.set(x, 0, z); outdoor.add(tree);
  }

  const car = new T.Group(); scene.add(car);
  function box(w, h, l, color, x, y, z, extra = {}) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, l), material(color, extra)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; car.add(mesh); return mesh;
  }
  // Rounded footprint, extruded upward; local negative z is the car's front.
  const s = new T.Shape(), w = .85, back = -.83, front = 3.48, r = .26;
  s.moveTo(-w + r, back); s.lineTo(w - r, back); s.quadraticCurveTo(w, back, w, back + r); s.lineTo(w, front - r); s.quadraticCurveTo(w, front, w - r, front); s.lineTo(-w + r, front); s.quadraticCurveTo(-w, front, -w, front - r); s.lineTo(-w, back + r); s.quadraticCurveTo(-w, back, -w + r, back);
  const bodyGeometry = new T.ExtrudeGeometry(s, { depth: .38, bevelEnabled: true, bevelThickness: .08, bevelSize: .05, bevelSegments: 3, steps: 1, curveSegments: 12 });
  bodyGeometry.rotateX(-Math.PI / 2);
  const body = new T.Mesh(bodyGeometry, material('#668a72', { metalness: .12, roughness: .42 })); body.position.y = .49; body.castShadow = true; body.receiveShadow = true; car.add(body);
  box(1.63, .12, 3.8, '#456b56', 0, .48, -1.3);
  box(1.43, .53, 1.86, '#b8c9bb', 0, 1.01, -1.35, { roughness: .4 });
  box(1.4, .04, 1.2, '#6d8e77', 0, 1.3, -1.32);
  const windshield = box(1.35, .44, .055, '#405f59', 0, 1.08, -2.31, { metalness: .1, roughness: .28 }); windshield.rotation.x = -.35;
  const rearWindow = box(1.32, .4, .055, '#4e6b5d', 0, 1.05, -.39); rearWindow.rotation.x = .3;
  for (const x of [-.731, .731]) {
    box(.035, .34, 1.5, '#49685c', x, 1.06, -1.34, { roughness: .25 });
    box(.046, .4, .055, '#76947d', x * 1.005, 1.06, -1.35);
    box(.16, .1, .22, '#557a60', x * 1.24, .98, -2.2);
    box(.06, .045, .2, '#d4ded0', x * 1.13, .8, -.8);
  }
  for (const x of [-.54, .54]) {
    box(.39, .13, .055, '#fff5cf', x, .7, -3.48, { emissive: '#fff1b1', emissiveIntensity: .4 });
    box(.36, .13, .055, '#d87a65', x, .7, .85, { emissive: '#cc4c31', emissiveIntensity: .2 });
  }
  box(.54, .1, .065, '#d8dec9', 0, .55, .88);
  const wheelGroups = [];
  for (const axle of [0, WHEELBASE]) for (const x of [-.9, .9]) {
    const group = new T.Group(); group.position.set(x, .34, -axle);
    const tire = new T.Mesh(new T.CylinderGeometry(.34, .34, .21, 24), material('#263d33')); tire.rotation.z = Math.PI / 2; tire.castShadow = true;
    const hub = new T.Mesh(new T.CylinderGeometry(.18, .18, .22, 16), material('#c2cbb8', { metalness: .25, roughness: .45 })); hub.rotation.z = Math.PI / 2;
    group.add(tire, hub); car.add(group); wheelGroups.push({ group, axle, side: x < 0 ? 'left' : 'right' });
  }
  const ghost = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.84, .055, 4.4)), new T.LineBasicMaterial({ color: '#8da788', transparent: true, opacity: .38 }));
  ghost.position.y = .026; scene.add(ghost);
  function marker(color) {
    const ring = new T.Mesh(new T.RingGeometry(.12, .2, 32), new T.MeshBasicMaterial({ color, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .035; scene.add(ring); return ring;
  }
  const frontMarker = marker('#d97c61'), rearMarker = marker('#258c80');
  function line(color, dashed) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(4096 * 3), 3)); geometry.setDrawRange(0, 0);
    const m = dashed ? new T.LineDashedMaterial({ color, dashSize: .16, gapSize: .13, transparent: true, opacity: .65 }) : new T.LineBasicMaterial({ color, transparent: true, opacity: .9 });
    const object = new T.Line(geometry, m); object.frustumCulled = false; scene.add(object); return object;
  }
  const lines = [line('#d97c61', false), line('#258c80', false), line('#d97c61', true), line('#258c80', true)];
  function fill(object, points) {
    const buffer = object.geometry.attributes.position;
    const n = Math.min(points.length, 4096);
    for (let i = 0; i < n; i++) buffer.setXYZ(i, points[i].x, .03, -points[i].y);
    buffer.needsUpdate = true; object.geometry.setDrawRange(0, n);
    if (object.material.isLineDashedMaterial) object.computeLineDistances();
  }
  const chassisMaterials = car.children.filter(child => child.isMesh).map(child => child.material);
  const world = new T.Group(); scene.add(world);
  function textTexture(value, background = null, ink = '#f3f5ec') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (background) { ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(0, 0, 512, 160, 38); ctx.fill(); }
    ctx.font = 'bold 100px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink; ctx.fillText(value, 256, 85);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
  }
  function floorText(value, x, y, width = 1.5, angle = 0) {
    const texture = textTexture(value), mesh = new T.Mesh(new T.PlaneGeometry(width, width / 3.2), new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = -angle; mesh.position.set(x, .032, -y); world.add(mesh); return mesh;
  }
  const ownBadge = new T.Sprite(new T.SpriteMaterial({ map: textTexture('내 차', '#245e48'), depthTest: false, toneMapped: false })); ownBadge.scale.set(1.35, .42, 1); ownBadge.renderOrder = 10; scene.add(ownBadge);
  function garageFloor(s) {
    function plane(w, l, color, x, y, elevation = -.016) { const m = new T.Mesh(new T.PlaneGeometry(w, l), material(color)); m.rotation.x = -Math.PI / 2; m.position.set(x, elevation, -y); m.receiveShadow = true; world.add(m); return m; }
    plane(36, 19.4, '#a8b1ad', 2.6, 0);
    plane(36, 7, '#98a29e', 2.6, 0, -.012);
    for (const row of [-1, 1]) plane(36, 5.4, '#71918a', 2.6, row * 6.2, -.01);
    const marks = [];
    for (const bay of s.garage.bays) {
      const c = rectangleCorners(bay);
      for (let i = 0; i < c.length; i++) for (const p of [c[i], c[(i + 1) % c.length]]) marks.push(p.x, .025, -p.y);
      floorText(bay.label, bay.x, bay.y < 0 ? -3.94 : 3.94, 1.4, bay.y < 0 ? 0 : Math.PI);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(marks, 3)); world.add(new T.LineSegments(g, new T.LineBasicMaterial({ color: '#f0f1dd' })));
    for (const x of [-10, -3, 4, 11, 17]) {
      const shape = new T.Shape(); [[-.9,-.13],[.12,-.13],[.12,-.46],[.92,0],[.12,.46],[.12,.13],[-.9,.13]].forEach(([a,b],i) => i ? shape.lineTo(a,b) : shape.moveTo(a,b)); shape.closePath();
      const geo = new T.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); const arrow = new T.Mesh(geo, new T.MeshBasicMaterial({ color: '#e9e7c9', transparent: true, opacity: .7 })); arrow.position.set(x,.026,0); world.add(arrow);
    }
    floorText('B2', s.target.x - 4.6, -1.9, 2.1);
    floorText(s.garage.targetLabel, s.target.x, -6.2, 2.1);
  }
  // Parked cars and concrete fixtures are static. Bake their colored box parts
  // into one mesh so three extra mirror renders do not multiply hundreds of calls.
  function batchStaticParts(objects) {
    const positions = [], normals = [], colors = [];
    for (const { group, dynamic } of objects.values()) {
      if (dynamic) continue;
      group.updateMatrixWorld(true);
      for (const mesh of [...group.children]) {
        if (!mesh.isMesh || !mesh.material.isMeshStandardMaterial || mesh.material.map) continue;
        const geometry = mesh.geometry.toNonIndexed(); geometry.applyMatrix4(mesh.matrixWorld);
        const p = geometry.attributes.position.array, n = geometry.attributes.normal.array, c = mesh.material.color;
        for (let i = 0; i < p.length; i++) { positions.push(p[i]); normals.push(n[i]); colors.push(i % 3 === 0 ? c.r : i % 3 === 1 ? c.g : c.b); }
        group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); geometry.dispose();
      }
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions,3)); geometry.setAttribute('normal', new T.Float32BufferAttribute(normals,3)); geometry.setAttribute('color', new T.Float32BufferAttribute(colors,3)); geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material('#ffffff', { vertexColors: true })); mesh.castShadow = mesh.receiveShadow = true; world.add(mesh);
  }
  let builtScenario = null;
  const obstacleObjects = new Map();
  function buildWorld(id) {
    disposeObjects(world);
    world.clear(); obstacleObjects.clear();
    const s = getScenario(id), garage = s.environment === 'garage';
    outdoor.visible = !garage;
    scene.background.set(garage ? '#b9c2bd' : '#e8eee5'); ambient.color.set(garage ? '#f3f5ef' : '#fffdf0'); ambient.groundColor.set(garage ? '#7c8884' : '#79917b'); ambient.intensity = garage ? 1.5 : 1.2; sun.intensity = garage ? 1.3 : 1.7;
    if (garage) garageFloor(s);
    if (s.target) {
      const t = s.target, pad = new T.Mesh(new T.PlaneGeometry(t.width, t.length), new T.MeshBasicMaterial({ color: '#b5db83', transparent: true, opacity: .5, depthWrite: false }));
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = -t.heading; pad.position.set(t.x, .006, -t.y); world.add(pad);
      const points = rectangleCorners(t).map(p => new T.Vector3(p.x, .025, -p.y));
      const outline = new T.LineLoop(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: '#8eae68' })); world.add(outline);
    }
    for (const o of obstaclesFor(s)) {
      const group = new T.Group();
      function part(w, h, l, color, x, y, z) { const m = new T.Mesh(new T.BoxGeometry(w, h, l), material(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); return m; }
      if (o.kind === 'car') {
        const h = o.height || 1.43, cab = h - .94;
        part(o.width - .12, .48, o.length - .1, o.color, 0, .68, 0);
        part(o.width - .35, cab, 1.95, '#a9b8b2', 0, .94 + cab / 2, .05);
        part(o.width - .39, cab * .7, .04, '#3e5659', 0, .96 + cab / 2, -.95);
        part(o.width - .39, cab * .67, .04, '#425e60', 0, .96 + cab / 2, 1.04);
        part(o.width - .39, .04, 1.4, o.color, 0, h, .05);
        for (const side of [-1, 1]) {
          part(.025, cab * .68, 1.7, '#425e60', side * (o.width / 2 - .16), .96 + cab / 2, .05);
          for (const z of [-1.35, 1.35]) part(.18, .53, .6, '#283733', side * (o.width / 2 - .03), .31, z);
          part(.42, .12, .035, '#fff2cb', side * .52, .74, -o.length / 2);
          part(.4, .12, .035, '#bb6d5e', side * .52, .73, o.length / 2);
        }
      } else if (o.kind === 'column') {
        part(o.width, o.height, o.length, o.color, 0, o.height / 2, 0);
        part(o.width + .015, 1.1, o.length + .015, '#3f716d', 0, .55, 0);
        part(o.width + .04, .6, o.length + .04, '#d2b65c', 0, .57, 0);
        for (const sign of [-1,1]) for (const x of [-.19, .06]) { const stripe = part(.095, .54, .012, '#38443c', x, .57, sign * (o.length / 2 + .03)); stripe.rotation.z = -.3; }
        if (o.label) { const tag = new T.Sprite(new T.SpriteMaterial({ map: textTexture(o.label), toneMapped: false })); tag.scale.set(.65,.22,1); tag.position.set(0,2.2,.01); group.add(tag); }
      } else if (o.kind === 'wall') {
        part(o.width, o.height, o.length, o.color, 0, o.height / 2, 0);
        part(o.width, .35, o.length + .02, '#4d7971', 0, .7, 0);
      } else {
        part(o.width, .17, o.length, '#d5b872', 0, .085, 0);
        for (const x of [-.65, 0, .65]) part(.18, .012, o.length + .006, '#4c5f4a', x, .177, 0);
      }
      group.position.set(o.x, 0, -o.y); group.rotation.y = -o.heading;
      const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(o.width + .06, (o.height || 1.47) + .06, o.length + .06)), new T.LineBasicMaterial({ color: '#ca914e', transparent: true, opacity: .8 })); edge.position.y = (o.height || 1.47) / 2; edge.visible = false; group.add(edge);
      world.add(group); obstacleObjects.set(o.id, { group, edge, dynamic: !!o.dynamic });
    }
    if (garage) batchStaticParts(obstacleObjects);
    builtScenario = id;
  }
  const attention = new T.Mesh(new T.RingGeometry(.24, .4, 40), new T.MeshBasicMaterial({ color: '#d6a04a', side: T.DoubleSide, depthTest: false, transparent: true, opacity: .9 })); attention.rotation.x = -Math.PI / 2; attention.renderOrder = 5; scene.add(attention);
  const mirrorIds = ['leftMirror', 'rearCamera', 'rightMirror'];
  const mirrorCameras = mirrorIds.map(() => new T.PerspectiveCamera(38, 3, .08, 90));
  const targets = mirrorIds.map(() => {
    const rt = new T.WebGLRenderTarget(480, 160, { depthBuffer: true, type: renderer.extensions.has('EXT_color_buffer_float') ? T.HalfFloatType : T.UnsignedByteType });
    rt.texture.colorSpace = T.LinearSRGBColorSpace; rt.texture.repeat.x = -1; rt.texture.offset.x = 1; return rt;
  });
  const blitScene = new T.Scene(), blitCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  blitCamera.position.z = 1;
  const blitMaterial = new T.MeshBasicMaterial({ map: targets[0].texture, depthTest: false, depthWrite: false, toneMapped: true });
  blitScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), blitMaterial));
  const mainViewport = document.getElementById('mainViewport');
  function viewport(element) {
    const a = element.getBoundingClientRect(), b = container.getBoundingClientRect();
    return { x: a.left - b.left, y: b.bottom - a.bottom, width: a.width, height: a.height };
  }
  function useViewport(rect) { renderer.setViewport(rect.x, rect.y, rect.width, rect.height); renderer.setScissor(rect.x, rect.y, rect.width, rect.height); renderer.setScissorTest(true); }
  function renderViews(state) {
    const rect = viewport(mainViewport);
    setCamera(rect.width / Math.max(rect.height, 1));
    renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, container.clientWidth, container.clientHeight); renderer.setClearColor(scene.background); renderer.clear();
    renderer.setRenderTarget(null); useViewport(rect); renderer.shadowMap.autoUpdate = true; renderer.clear(); renderer.render(scene, camera); renderer.shadowMap.autoUpdate = false;
    // The rearward cameras share the same moving world. Texture UVs mirror the
    // image horizontally; the car's projection matrix stays physically valid.
    mirrorIds.forEach((id, i) => {
      const el = document.getElementById(id); if (el.hidden || (i === 1 && state.gear !== -1)) return;
      const r = viewport(el), mc = mirrorCameras[i], side = i === 0 ? -1 : 1;
      if (r.width < 1 || r.height < 1) return;
      const p = vehiclePoint(state.pose, i === 1 ? -.96 : 1.95, i === 1 ? 0 : side * 1.04);
      const aim = vehiclePoint(state.pose, i === 1 ? -7 : -7.5, i === 1 ? 0 : side * 3.1);
      mc.position.set(p.x, i === 1 ? .95 : 1.12, -p.y); mc.up.set(0, 1, 0); mc.lookAt(aim.x, .04, -aim.y); mc.aspect = r.width / r.height; mc.updateProjectionMatrix();
      const rt = targets[i], ratio = Math.min(window.devicePixelRatio || 1, 1.5), tw = Math.ceil(r.width * ratio), th = Math.ceil(r.height * ratio);
      if (rt.width !== tw || rt.height !== th) rt.setSize(tw, th);
      renderer.setRenderTarget(rt); renderer.setViewport(0, 0, tw, th); renderer.setScissorTest(false); renderer.clear();
      // Teaching overlays belong to the overview, not to the mirror optics.
      const visible = [...lines, frontMarker, rearMarker, attention, ghost, ownBadge].map(o => o.visible);
      [...lines, frontMarker, rearMarker, attention, ghost, ownBadge].forEach(o => { o.visible = false; });
      if (state.showWheels) chassisMaterials.forEach(m => { m.opacity = 1; m.transparent = false; m.depthWrite = true; m.needsUpdate = true; });
      renderer.render(scene, mc);
      if (state.showWheels) chassisMaterials.forEach(m => { m.opacity = .18; m.transparent = true; m.depthWrite = false; m.needsUpdate = true; });
      [...lines, frontMarker, rearMarker, attention, ghost, ownBadge].forEach((o, n) => { o.visible = visible[n]; });
      renderer.setRenderTarget(null); useViewport(r); blitMaterial.map = rt.texture; renderer.clear(); renderer.render(blitScene, blitCamera);
    });
    renderer.setScissorTest(false);
  }
  let view = '3d', lastState = null, lastSignature = null, previousXray = false;
  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    renderer.setSize(width, height, false);
    setCamera(); lastSignature = null; if (lastState) render(lastState);
  }
  function setCamera(aspect = mainViewport.clientWidth / Math.max(mainViewport.clientHeight, 1)) {
    let f = getScenario(lastState?.scenarioId).focus;
    if (view === 'follow' && lastState) { const p = vehiclePoint(lastState.pose,1.3); f = { x: p.x, y: p.y, width: 11, height: 9 }; }
    const half = Math.max((f.height * (view === 'top' ? 1 : .77) + 1.2) / 2, f.width / Math.max(aspect, .1) / 2);
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
    camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0);
    camera.position.set(f.x + (view === 'top' ? 0 : 6), view === 'top' ? 26 : 24, -f.y + (view === 'top' ? .001 : 18));
    camera.lookAt(f.x, 0, -f.y); camera.updateMatrixWorld();
    const corners = [[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b]) => new T.Vector3(f.x + a*f.width/2,0,-f.y+b*f.height/2).applyMatrix4(camera.matrixWorldInverse));
    const fit = Math.max(...corners.map(p=>Math.abs(p.y)+1.1), ...corners.map(p=>(Math.abs(p.x)+.2)/Math.max(aspect,.1)));
    camera.left=-fit*aspect; camera.right=fit*aspect; camera.top=fit; camera.bottom=-fit; camera.updateProjectionMatrix();
  }
  const frontLabel = document.getElementById('frontLabel'), rearLabel = document.getElementById('rearLabel');
  function placeLabel(label, p, offset) {
    const v = new T.Vector3(p.x, .4, -p.y).project(camera);
    const x = (v.x + 1) / 2 * mainViewport.clientWidth, y = (1 - v.y) / 2 * mainViewport.clientHeight;
    const lx = Math.max(28, Math.min(mainViewport.clientWidth - 28, x));
    let ly = Math.max(12, Math.min(mainViewport.clientHeight - 12, y + offset));
    const notice = document.getElementById('sceneNotice');
    if (!notice.hidden) {
      const n = notice.getBoundingClientRect(), m = mainViewport.getBoundingClientRect();
      if (lx + 24 > n.left - m.left && lx - 24 < n.right - m.left && ly - 10 < n.bottom - m.top && ly + 10 > n.top - m.top) ly = n.bottom - m.top + 12;
    }
    label.style.transform = `translate(${lx}px,${ly}px) translate(-50%,-50%)`;
    label.style.visibility = Math.abs(v.x) < .9 && Math.abs(v.y) < .88 ? 'visible' : 'hidden';
  }
  function render(state) {
    if (disposed) return;
    lastState = state;
    const signature = [state.pose.x, state.pose.y, state.pose.heading, state.handAngle, state.gear, state.history.length, state.historyVersion, state.historyIndex, state.showPaths, state.showWheels, state.scenarioId, state.hazardTime, state.modelStep, state.modelView, state.nearObstacleId, state.showMirrors, state.showRear, state.attention, mainViewport.clientHeight].join('|');
    if (lastSignature === signature) return;
    lastSignature = signature;
    if (builtScenario !== state.scenarioId) buildWorld(state.scenarioId);
    for (const o of obstaclesFor(getScenario(state.scenarioId), state.hazardTime)) {
      const object = obstacleObjects.get(o.id); object.group.position.set(o.x, 0, -o.y); object.edge.visible = state.nearObstacleId === o.id;
    }
    if (state.showWheels !== previousXray) {
      chassisMaterials.forEach(m => { m.opacity = state.showWheels ? .18 : 1; m.transparent = state.showWheels; m.depthWrite = !state.showWheels; m.needsUpdate = true; });
      previousXray = state.showWheels;
    }
    const { pose, handAngle, gear, history, historyIndex, showPaths } = state;
    car.position.set(pose.x, 0, -pose.y); car.rotation.y = -pose.heading;
    const badgePoint = vehiclePoint(pose, 1.3); ownBadge.position.set(badgePoint.x, 1.85, -badgePoint.y); ownBadge.visible = getScenario(state.scenarioId).environment === 'garage';
    const angles = frontWheelAngles(handAngle);
    wheelGroups.forEach(w => { w.group.rotation.y = w.axle ? -angles[w.side] : 0; });
    const scenario = getScenario(state.scenarioId);
    const initial = scenario.setup || history[0]?.pose || pose;
    ghost.material.color.set(scenario.garage ? '#f2e7be' : '#8da788'); ghost.material.opacity = scenario.garage ? .9 : .38;
    const ghostCenter = vehiclePoint(initial, 1.32); ghost.position.set(ghostCenter.x, .03, -ghostCenter.y); ghost.rotation.y = -initial.heading;
    const actual = history.slice(0, historyIndex + 1);
    fill(lines[0], actual.map(frame => vehiclePoint(frame.pose, 3.5))); fill(lines[1], actual.map(frame => vehiclePoint(frame.pose, -.9)));
    fill(lines[2], showPaths ? projectedPath(pose, handAngle, gear, 3.5) : []); fill(lines[3], showPaths ? projectedPath(pose, handAngle, gear, -.9) : []);
    const front = vehiclePoint(pose, 3.5), rear = vehiclePoint(pose, -.9);
    frontMarker.position.set(front.x, .036, -front.y); rearMarker.position.set(rear.x, .036, -rear.y);
    attention.visible = state.mode === 'free' && state.attention !== 'all';
    const focusPoint = state.attention === 'front-left' ? vehiclePoint(pose, 3.3, -.88) : state.attention === 'front-right' ? vehiclePoint(pose, 3.3, .88) : state.attention === 'front' ? vehiclePoint(pose, 3.5) : rear;
    attention.position.set(focusPoint.x, .05, -focusPoint.y);
    renderViews(state); placeLabel(frontLabel, front, -17); placeLabel(rearLabel, rear, 20);
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  const lost = event => { event.preventDefault(); onContextLoss(); };
  renderer.domElement.addEventListener('webglcontextlost', lost, { once: true });
  return { render, kind: '3d', setView(value) { if (disposed) return; view = value; setCamera(); lastSignature = null; if (lastState) render(lastState); }, dispose() {
    if (disposed) return; disposed = true; observer.disconnect(); renderer.domElement.removeEventListener('webglcontextlost', lost);
    disposeObjects(scene); disposeObjects(blitScene); targets.forEach(target => target.dispose()); renderer.dispose(); renderer.domElement.remove();
  } };
}

function flatScene(container) {
  const old = container.querySelector('canvas'); if (old) old.remove();
  const canvas = document.createElement('canvas'); container.prepend(canvas);
  const ctx = canvas.getContext('2d'); let latest;
  const project = p => { const f = getScenario(latest?.scenarioId).focus, scale = Math.min(canvas.clientHeight / f.height, canvas.clientWidth / f.width); return { x: canvas.clientWidth / 2 + (p.x - f.x) * scale, y: canvas.clientHeight / 2 - (p.y - f.y) * scale }; };
  function render(state) {
    latest = state;
    const w = container.clientWidth, h = container.clientHeight, ratio = Math.min(devicePixelRatio || 1, 2);
    const s = getScenario(state.scenarioId);
    canvas.width = w * ratio; canvas.height = h * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = s.garage ? '#a8b1ad' : '#e8eee5'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d3dece'; ctx.lineWidth = 1;
    if (!s.garage) for (let i = -20; i <= 20; i++) { ctx.beginPath(); let a = project({ x: i, y: -20 }), b = project({ x: i, y: 20 }); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); a = project({ x: -20, y: i }); b = project({ x: 20, y: i }); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    function path(points, color, dashed = false) { ctx.beginPath(); ctx.setLineDash(dashed ? [5, 6] : []); ctx.strokeStyle = color; ctx.lineWidth = 2; points.forEach((p, i) => { const q = project(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.stroke(); ctx.setLineDash([]); }
    if (s.garage) for (const bay of s.garage.bays) {
      const c = rectangleCorners(bay).map(project); ctx.beginPath(); c.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.fillStyle='#71918a'; ctx.strokeStyle='#eff0df'; ctx.fill(); ctx.stroke();
      const label=project({x:bay.x,y:bay.y<0?-3.9:3.9}); ctx.fillStyle='#fffef2'; ctx.font='9px sans-serif'; ctx.textAlign='center'; ctx.fillText(bay.label,label.x,label.y);
    }
    for (const rect of [...(s.target ? [{ ...s.target, kind: 'target' }] : []), ...obstaclesFor(s, state.hazardTime)]) {
      const points = rectangleCorners(rect).map(project); ctx.beginPath(); points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath(); ctx.fillStyle = rect.kind === 'target' ? '#c0d5a5' : rect.color || '#c2ac7a'; ctx.strokeStyle = state.nearObstacleId === rect.id ? '#b4733d' : '#809775'; ctx.fill(); ctx.stroke();
    }
    for (const [along, color, label, offset] of [[3.5, '#d97c61', 'frontLabel', -17], [-.9, '#258c80', 'rearLabel', 19]]) {
      path(state.history.slice(0, state.historyIndex + 1).map(f => vehiclePoint(f.pose, along)), color);
      if (state.showPaths) path(projectedPath(state.pose, state.handAngle, state.gear, along), color, true);
      const p = project(vehiclePoint(state.pose, along)), el = document.getElementById(label); el.style.transform = `translate(${p.x}px,${p.y + offset}px) translate(-50%,-50%)`;
    }
    const corners = [[3.5, -.85], [3.5, .85], [-.9, .85], [-.9, -.85]].map(([a, r]) => project(vehiclePoint(state.pose, a, r)));
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = '#75967a'; ctx.strokeStyle = '#4b6b54'; ctx.fill(); ctx.stroke();
    const wheels = frontWheelAngles(state.handAngle);
    for (const along of [0, WHEELBASE]) for (const right of [-.95, .95]) {
      const center = vehiclePoint(state.pose, along, right), a = state.pose.heading + (along ? wheels[right < 0 ? 'left' : 'right'] : 0);
      path([{ x: center.x - .3 * Math.sin(a), y: center.y - .3 * Math.cos(a) }, { x: center.x + .3 * Math.sin(a), y: center.y + .3 * Math.cos(a) }], '#283c30');
    }
  }
  const observer = new ResizeObserver(() => latest && render(latest)); observer.observe(container);
  return { render, kind: '2d', setView() {}, dispose() { observer.disconnect(); canvas.remove(); } };
}
