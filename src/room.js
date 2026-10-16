import * as THREE from "three";
import { gsap } from "gsap";
import { drawBrandMark } from "./brand.js";

export function createRoom(canvas, callbacks) {
  const {
    onSelect,
    onPage,
    onHover,
    onReady,
    onError,
    onSection = () => {},
  } = callbacks;
  const mobile = () => innerWidth < 700;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: devicePixelRatio < 2,
      powerPreference: "high-performance",
    });
  } catch {
    onError();
    return {
      setFilms() {},
      resize() {},
      step() {},
      reset() {},
      focus: async () => {},
      openCurrent() {},
      setVisible() {},
      setSection() {},
    };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile() ? 1.35 : 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#09090b");
  scene.fog = new THREE.Fog("#09090b", 33, 65);
  const camera = new THREE.PerspectiveCamera(mobile() ? 65 : 58, 1, 0.1, 80);
  const home = new THREE.Vector3(0, 1.3, 10.7);
  camera.position.copy(home);
  const look = { yaw: 0, pitch: 0 };
  let dirty = true,
    enabled = true,
    objects = [],
    films = [],
    section = 0,
    selected = null,
    hovered = null,
    selectionVersion = 0;
  let selectionTimeline = null,
    finishSelection = null;
  const animated = new Set();
  function tween(target, values, duration = 0.65) {
    animated.add(target);
    return gsap.to(target, {
      ...values,
      duration: reduced ? 0.01 : duration,
      ease: "power3.inOut",
      overwrite: "auto",
      onUpdate: () => (dirty = true),
      onComplete: () => {
        animated.delete(target);
        dirty = true;
      },
    });
  }
  const material = (color, roughness = 0.8) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const wood = material("#292329"),
    back = material("#141217"),
    edge = material("#65513d", 0.5);
  function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  box(scene, 30, 0.2, 35, material("#1e1920", 0.35), 0, -4.3, 5);
  box(scene, 30, 0.15, 35, material("#151216"), 0, 8, 5);
  const walls = [];
  for (let side = 0; side < 3; side++) {
    const wall = new THREE.Group();
    if (side === 0) wall.position.set(0, 0, -8);
    if (side === 1) {
      wall.position.set(-12.5, 0, 4);
      wall.rotation.y = Math.PI / 2;
    }
    if (side === 2) {
      wall.position.set(12.5, 0, 4);
      wall.rotation.y = -Math.PI / 2;
    }
    scene.add(wall);
    walls.push(wall);
    box(
      wall,
      25,
      12,
      0.3,
      material(side === 0 ? "#2b1820" : "#21171e"),
      0,
      1,
      -1.3,
    );
    box(wall, 23.7, 10.5, 0.25, back, 0, 1, -0.8);
    for (const y of [-3.9, -0.5, 2.9, 6.3]) {
      box(wall, 24, 0.2, 2.1, wood, 0, y, 0);
      box(wall, 24, 0.045, 0.08, edge, 0, y - 0.11, 1.05);
      box(
        wall,
        22.8,
        0.025,
        0.05,
        new THREE.MeshBasicMaterial({ color: "#b79c74" }),
        0,
        y - 0.13,
        0.35,
      );
    }
    for (const x of [-12, 0, 12]) box(wall, 0.15, 10.4, 2.1, wood, x, 1.15, 0);
    const light = new THREE.PointLight("#f4d6ac", 24, 27, 2);
    light.position.set(0, 5, 3);
    wall.add(light);
  }
  // Ceiling fixtures and floor lines make the depth of the U-shaped room readable.
  const ceilingMat = new THREE.MeshBasicMaterial({ color: "#cfb38a" });
  for (const z of [-1, 7, 14]) box(scene, 6, 0.04, 0.12, ceilingMat, 0, 7.7, z);
  for (const x of [-9, -3, 3, 9])
    box(scene, 0.015, 0.01, 28, material("#49404a"), x, -4.18, 4);
  scene.add(new THREE.HemisphereLight("#eee8e2", "#30232b", 2.2));
  const key = new THREE.DirectionalLight("#f1dfc9", 2.1);
  key.position.set(-2, 6, 15);
  scene.add(key);
  const glow = new THREE.PointLight("#7a2533", 16, 26);
  glow.position.set(0, 1, 7);
  scene.add(glow);
  const loader = new THREE.TextureLoader(),
    textures = new Map(),
    pending = new Set();
  function titleTexture(f, spine = false) {
    const c = document.createElement("canvas");
    c.width = spine ? 128 : 384;
    c.height = spine ? 768 : 576;
    const ctx = c.getContext("2d"),
      gradient = ctx.createLinearGradient(0, 0, c.width, c.height);
    gradient.addColorStop(0, "#54303b");
    gradient.addColorStop(1, "#16171e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#c9a66b";
    ctx.font = spine ? "18px sans-serif" : "17px sans-serif";
    drawBrandMark(ctx, spine ? 28 : 22, spine ? 15 : 14, spine ? 32 : 34);
    ctx.fillText("NOIR", spine ? 61 : 62, spine ? 39 : 38);
    ctx.fillStyle = "#f5f5f4";
    if (spine) {
      ctx.save();
      ctx.translate(78, 100);
      ctx.rotate(Math.PI / 2);
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(f.title, 0, 0, 550);
      ctx.restore();
      ctx.font = "21px sans-serif";
      ctx.fillText(String(f.year), 35, 730);
    } else {
      ctx.font = "32px sans-serif";
      let line = "",
        y = 220;
      for (const word of f.title.split(" ")) {
        if (ctx.measureText(line + word).width > 330) {
          ctx.fillText(line, 26, y);
          line = "";
          y += 42;
        }
        line += word + " ";
      }
      ctx.fillText(line, 26, y);
      ctx.font = "22px sans-serif";
      ctx.fillText(String(f.year), 26, 530);
    }
    const small = document.createElement("canvas");
    small.width = spine ? 96 : 256;
    small.height = spine ? 576 : 384;
    small.getContext("2d").drawImage(c, 0, 0, small.width, small.height);
    const texture = new THREE.CanvasTexture(small);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function loadPoster(object) {
    const f = object.userData.film,
      face = object.userData.coverMaterial;
    if (!f.poster || pending.has(f.poster)) return;
    if (textures.has(f.poster)) {
      if (face.map !== textures.get(f.poster)) {
        face.map?.dispose();
        face.map = textures.get(f.poster);
        face.needsUpdate = true;
      }
      return;
    }
    pending.add(f.poster);
    loader.load(
      f.poster,
      (t) => {
        pending.delete(f.poster);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 2;
        textures.set(f.poster, t);
        // Bound GPU memory when browsing hundreds of covers.
        if (textures.size > 24) {
          const key = textures.keys().next().value;
          if (key !== f.poster) {
            const evicted = textures.get(key);
            for (const item of objects) {
              const mat = item.userData.coverMaterial;
              if (mat.map === evicted) {
                mat.map = titleTexture(item.userData.film);
                mat.needsUpdate = true;
              }
            }
            evicted.dispose();
            textures.delete(key);
          }
        }
        if (object.userData.live) {
          face.map?.dispose();
          face.map = t;
          face.needsUpdate = true;
        }
        dirty = true;
      },
      undefined,
      () => pending.delete(f.poster),
    );
  }
  function makeCase(f, index, count) {
    const smallRoom = count >= 9 && count <= 12;
    const perWall = smallRoom ? Math.ceil(count / 3) : 36;
    const wallIndex = smallRoom
        ? Math.floor(index / perWall)
        : count <= 12
          ? 0
          : Math.floor(index / 36),
      slot = smallRoom ? index % perWall : count <= 12 ? index : index % 36;
    const columns = smallRoom ? perWall : count <= 12 ? 4 : 12,
      row = smallRoom ? 1 : Math.floor(slot / columns),
      col = slot % columns;
    const g = new THREE.Group();
    g.position.set(
      (col - (columns - 1) / 2) * (count <= 12 ? 4.6 : 1.8),
      4.3 - row * 3.4,
      0.6,
    );
    g.rotation.y = Math.PI * 0.37;
    g.userData = {
      film: f,
      live: true,
      home: g.position.clone(),
      angle: g.rotation.y,
      wall: walls[wallIndex],
    };
    const shell = material("#1c1d24", 0.45),
      inside = material("#25242c", 0.65);
    box(g, 1.85, 2.7, 0.12, shell, 0, 0, -0.13);
    const disc = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.68, 40),
      new THREE.MeshStandardMaterial({
        color: "#a8a7ae",
        metalness: 0.85,
        roughness: 0.28,
        side: THREE.DoubleSide,
      }),
    );
    disc.position.set(0.1, -0.1, -0.05);
    g.add(disc);
    const spine = material("#ffffff");
    spine.map = titleTexture(f, true);
    box(
      g,
      0.12,
      2.7,
      0.43,
      [shell, spine, shell, shell, shell, shell],
      -0.95,
      0,
      0,
    );
    const hinge = new THREE.Group();
    hinge.position.set(-0.9, 0, 0.16);
    g.add(hinge);
    const coverMaterial = material("#ffffff", 0.7);
    coverMaterial.map = titleTexture(f);
    box(
      hinge,
      1.85,
      2.7,
      0.055,
      [shell, shell, shell, shell, coverMaterial, inside],
      0.925,
      0,
      0,
    );
    g.userData.hinge = hinge;
    g.userData.coverMaterial = coverMaterial;
    walls[wallIndex].add(g);
    objects.push(g);
    return g;
  }
  function disposeCases() {
    for (const o of objects) {
      o.userData.live = false;
      for (const target of [
        o.position,
        o.rotation,
        o.userData.hinge.rotation,
        o.userData.coverMaterial.emissive,
      ]) {
        animated.delete(target);
        gsap.killTweensOf(target);
      }
      gsap.killTweensOf(o.position);
      gsap.killTweensOf(o.rotation);
      o.removeFromParent();
      const materials = new Set(),
        geometries = new Set();
      o.traverse((m) => {
        if (m.geometry) geometries.add(m.geometry);
        if (m.material)
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((a) =>
            materials.add(a),
          );
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        if (m.map && ![...textures.values()].includes(m.map)) m.map.dispose();
        m.dispose();
      });
    }
    objects = [];
    hovered = null;
  }
  function setFilms(next) {
    films = next;
    section = 0;
    rebuild();
  }
  function rebuild() {
    reset(true);
    disposeCases();
    const slice = films.slice(section * 108, (section + 1) * 108);
    slice.forEach((f, i) => makeCase(f, i, slice.length));
    // Load only a handful of covers up front; spines have local title textures.
    objects.slice(0, 12).forEach(loadPoster);
    onSection(section + 1, Math.max(1, Math.ceil(films.length / 108)));
    dirty = true;
  }
  function setSection(index) {
    section = THREE.MathUtils.clamp(
      index,
      0,
      Math.max(0, Math.ceil(films.length / 108) - 1),
    );
    rebuild();
  }
  function announceDirection() {
    const p = look.yaw < -0.4 ? 1 : look.yaw > 0.4 ? 3 : 2;
    onPage(p, 3);
  }
  function step(delta) {
    if (selected) return;
    tween(look, {
      yaw: THREE.MathUtils.clamp(look.yaw + delta * 1.35, -1.4, 1.4),
      pitch: 0,
    });
    setTimeout(announceDirection, reduced ? 0 : 660);
  }
  async function focus(id) {
    reset(true);
    const version = ++selectionVersion;
    selected = objects.find((o) => o.userData.film.id === id);
    if (!selected) {
      const i = films.findIndex((f) => f.id === id);
      if (i < 0) return;
      setSection(Math.floor(i / 108));
      selected = objects.find((o) => o.userData.film.id === id);
    }
    if (!selected) return;
    const object = selected;
    loadPoster(object);
    const world = object.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      object.userData.wall.getWorldQuaternion(new THREE.Quaternion()),
    );
    const destination = world.clone().addScaledVector(normal, 6.3);
    const aimDirection = world.clone().sub(destination).normalize();
    const yaw = Math.atan2(aimDirection.x, -aimDirection.z);
    await new Promise((resolve) => {
      finishSelection = resolve;
      const tl = gsap.timeline({
        defaults: { duration: reduced ? 0.01 : 0.65, ease: "power3.inOut" },
        onUpdate: () => (dirty = true),
        onComplete: () => {
          selectionTimeline = null;
          finishSelection = null;
          resolve();
        },
      });
      selectionTimeline = tl;
      animated.add(object);
      tl.to(look, { yaw, pitch: 0 }, 0)
        .to(
          camera.position,
          { x: destination.x, y: world.y, z: destination.z },
          0,
        )
        .to(object.position, { z: 2.5 }, 0)
        .to(object.rotation, { y: 0 }, reduced ? 0.01 : 0.45)
        .to(
          object.userData.hinge.rotation,
          { y: -2.25 },
          reduced ? 0.02 : 1.05,
        );
    });
    animated.delete(object);
    if (version !== selectionVersion) return;
    dirty = true;
  }
  function reset(instant = false) {
    selectionVersion++;
    if (selectionTimeline) {
      selectionTimeline.kill();
      selectionTimeline = null;
      finishSelection?.();
      finishSelection = null;
    }
    if (selected) {
      animated.delete(selected);
      gsap.killTweensOf(selected.position);
      gsap.killTweensOf(selected.rotation);
      gsap.killTweensOf(selected.userData.hinge.rotation);
      if (instant) {
        selected.position.copy(selected.userData.home);
        selected.rotation.y = selected.userData.angle;
        selected.userData.hinge.rotation.y = 0;
      } else {
        tween(selected.userData.hinge.rotation, { y: 0 }, 0.4);
        tween(selected.rotation, { y: selected.userData.angle });
        tween(selected.position, { ...selected.userData.home });
      }
    }
    selected = null;
    tween(camera.position, { ...home }, instant ? 0.01 : 0.8);
    tween(look, { yaw: 0, pitch: 0 }, instant ? 0.01 : 0.8);
    onPage(2, 3);
    dirty = true;
  }
  const ray = new THREE.Raycaster(),
    point = new THREE.Vector2();
  function hit(event) {
    const rect = canvas.getBoundingClientRect();
    point.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(point, camera);
    const found = ray.intersectObjects(objects, true)[0]?.object;
    let current = found;
    while (current && !current.userData.film) current = current.parent;
    return current?.userData.film ? current : null;
  }
  function hover(object) {
    if (object === hovered) return;
    if (hovered && hovered.userData.live && !selected) {
      tween(hovered.position, { z: 0.6 }, 0.25);
      tween(hovered.userData.coverMaterial.emissive, { r: 0, g: 0, b: 0 }, 0.2);
    }
    hovered = object;
    if (object && !selected) {
      loadPoster(object);
      tween(object.position, { z: 1 }, 0.3);
      tween(
        object.userData.coverMaterial.emissive,
        { r: 0.13, g: 0.1, b: 0.06 },
        0.2,
      );
    }
    canvas.style.cursor = object ? "pointer" : "grab";
    onHover(object?.userData.film || null);
  }
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (selected) return;
    drag = {
      x: e.clientX,
      y: e.clientY,
      yaw: look.yaw,
      pitch: look.pitch,
      moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (selected) return;
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.abs(dx) > 7 || Math.abs(dy) > 7) drag.moved = true;
      if (drag.moved) {
        gsap.killTweensOf(look);
        animated.delete(look);
        look.yaw = THREE.MathUtils.clamp(drag.yaw - dx * 0.004, -1.4, 1.4);
        look.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.002, -0.35, 0.4);
        dirty = true;
      }
    } else if (e.pointerType !== "touch") hover(hit(e));
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    announceDirection();
    if (!moved && !selected) {
      const object = hit(e);
      if (object) onSelect(object.userData.film);
    }
  });
  canvas.addEventListener("pointercancel", () => (drag = null));
  canvas.addEventListener("pointerleave", () => {
    if (!drag) hover(null);
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!selected && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        look.yaw = THREE.MathUtils.clamp(
          look.yaw + e.deltaX * 0.002,
          -1.4,
          1.4,
        );
        dirty = true;
        announceDirection();
      }
    },
    { passive: true },
  );
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.fov = mobile() ? 65 : 58;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  document.addEventListener("visibilitychange", () => (dirty = true));
  let last = 0;
  renderer.setAnimationLoop((now) => {
    if (
      !enabled ||
      document.hidden ||
      (!dirty && !animated.size) ||
      now - last < (mobile() ? 32 : 16)
    )
      return;
    last = now;
    const direction = new THREE.Vector3(
      Math.sin(look.yaw) * Math.cos(look.pitch),
      Math.sin(look.pitch),
      -Math.cos(look.yaw) * Math.cos(look.pitch),
    );
    camera.lookAt(camera.position.clone().add(direction));
    renderer.render(scene, camera);
    dirty = false;
  });
  requestAnimationFrame(onReady);
  return {
    setFilms,
    resize,
    step,
    focus,
    reset,
    setSection,
    openCurrent: () => {
      const f = objects[0]?.userData.film;
      if (f) onSelect(f);
    },
    setVisible: (value) => {
      enabled = value;
      dirty = true;
    },
  };
}
