const TIMEOUT_MS = 15000;

export function mountArtwork(frame, loadModules = () => Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js')])) {
  const poster = frame.querySelector('img');
  const start = frame.querySelector('[data-start]');
  const status = frame.querySelector('[role=status]');
  const modelUrl = frame.dataset.model;
  if (!poster || !start || !modelUrl) throw new Error('Artwork requires a poster, button and model URL');
  let cleanup = () => {};
  let generation = 0;
  start.addEventListener('click', async () => {
    cleanup();
    const current = ++generation;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    status.textContent = '3D作品を読み込み中';
    start.disabled = true;
    let renderer, controls, observer, resizeObserver, scene, model, raf = 0, visible = true;
    const dispose = () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      resizeObserver?.disconnect();
      controls?.dispose();
      model?.traverse(node => {
        node.geometry?.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) if (material) {
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
          material.dispose();
        }
      });
      renderer?.dispose();
      renderer?.domElement.remove();
      poster.hidden = false;
      start.disabled = false;
    };
    cleanup = () => { generation++; controller.abort(); clearTimeout(timer); dispose(); };
    try {
      const canvas = document.createElement('canvas');
      if (!canvas.getContext('webgl2') && !canvas.getContext('webgl')) throw new Error('WebGL unavailable');
      const [{ Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight, Box3, Vector3 }, { GLTFLoader }, { OrbitControls }] = await Promise.race([
        loadModules(),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Load timed out')), { once: true }))
      ]);
      if (current !== generation) return;
      const response = await fetch(modelUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      if (current !== generation) return;
      const gltf = await Promise.race([new GLTFLoader().parseAsync(data, modelUrl), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Load timed out')), { once: true }))]);
      if (current !== generation) return;
      model = gltf.scene;
      scene = new Scene(); scene.add(model);
      const box = new Box3().setFromObject(model);
      const size = box.getSize(new Vector3()).length();
      if (!Number.isFinite(size) || size <= 0) throw new Error('Empty model');
      const center = box.getCenter(new Vector3());
      const camera = new PerspectiveCamera(45, 1, .01, size * 100);
      camera.position.copy(center).add(new Vector3(size, size * .6, size));
      scene.add(new AmbientLight(0xffffff, 2));
      const light = new DirectionalLight(0xffffff, 2); light.position.set(3, 4, 5); scene.add(light);
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const resize = () => { const width = frame.clientWidth; camera.aspect = width / Math.max(frame.clientHeight, 1); camera.updateProjectionMatrix(); renderer.setSize(width, frame.clientHeight); };
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(frame);
      controls = new OrbitControls(camera, canvas); controls.target.copy(center); controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches; controls.update();
      const original = camera.position.clone();
      const orbit = (axis, angle) => camera.position.sub(controls.target).applyAxisAngle(axis, angle).add(controls.target);
      const actions = {
        left: () => orbit(new Vector3(0, 1, 0), .2), right: () => orbit(new Vector3(0, 1, 0), -.2),
        up: () => orbit(new Vector3(1, 0, 0), .2), down: () => orbit(new Vector3(1, 0, 0), -.2),
        closer: () => camera.position.lerp(controls.target, .15), farther: () => camera.position.sub(controls.target).multiplyScalar(1.15).add(controls.target),
        reset: () => { camera.position.copy(original); controls.target.copy(center); controls.update(); }
      };
      const onAction = event => { const action = event.target.closest('[data-action]')?.dataset.action; if (actions[action]) { actions[action](); controls.update(); renderer.render(scene, camera); } };
      frame.addEventListener('click', onAction);
      const priorDispose = dispose;
      cleanup = () => { generation++; controller.abort(); clearTimeout(timer); frame.removeEventListener('click', onAction); priorDispose(); };
      observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) draw(); else cancelAnimationFrame(raf); });
      observer.observe(frame);
      const draw = () => { cancelAnimationFrame(raf); if (!visible || document.hidden || current !== generation) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(draw); };
      const onVisibility = () => { if (document.hidden) cancelAnimationFrame(raf); else draw(); };
      document.addEventListener('visibilitychange', onVisibility);
      const activeCleanup = cleanup;
      cleanup = () => { document.removeEventListener('visibilitychange', onVisibility); activeCleanup(); };
      poster.hidden = true; frame.insertBefore(canvas, poster); status.textContent = '3D表示中。マウス、タッチ、または操作ボタンを使用できます。';
      clearTimeout(timer); draw();
    } catch (error) {
      if (current !== generation) return;
      cleanup(); status.textContent = `3Dを表示できませんでした。ポスターをご覧ください。再試行できます。 (${error.message})`;
    }
  });
  return () => cleanup();
}
