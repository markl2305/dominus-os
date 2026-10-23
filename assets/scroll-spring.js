// A small scalar spring. Retargeting keeps its presentation value and velocity.
// Browser clocks are injected at construction, so importing this module is SSR-safe.
export function createSpring({
  value = 0, response = 0.34, dampingRatio = 1, precision = 0.001,
  onUpdate = () => {}, onRest = () => {},
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
} = {}) {
  let position = value, target = value, velocity = 0, frame = null, lastTime = null, destroyed = false;
  const omega = 2 * Math.PI / response;
  const stop = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    lastTime = null;
  };
  const settled = () => Math.abs(target - position) <= precision && Math.abs(velocity) <= precision * omega;
  const tick = time => {
    frame = null;
    if (destroyed) return;
    const elapsed = lastTime === null ? 1 / 60 : Math.min(Math.max((time - lastTime) / 1000, 0), 0.04);
    lastTime = time;
    // Small integration steps keep the critically damped response stable on slow frames.
    const steps = Math.max(1, Math.ceil(elapsed * 120)), dt = elapsed / steps;
    for (let i = 0; i < steps; i++) {
      velocity += (omega * omega * (target - position) - 2 * dampingRatio * omega * velocity) * dt;
      position += velocity * dt;
    }
    if (settled()) {
      position = target;
      velocity = 0;
      lastTime = null;
      onUpdate(position);
      if (!destroyed && frame === null && settled()) onRest(position);
    } else {
      onUpdate(position);
      if (!destroyed && frame === null) frame = requestFrame(tick);
    }
  };
  const api = {
    get value() { return position; },
    get velocity() { return velocity; },
    get target() { return target; },
    get isRunning() { return frame !== null; },
    setTarget(next) {
      if (destroyed || !Number.isFinite(next)) return api;
      target = next;
      if (settled()) {
        stop();
        position = target;
        velocity = 0;
        onUpdate(position);
        onRest(position);
      } else if (frame === null) {
        lastTime = null;
        frame = requestFrame(tick);
      }
      return api;
    },
    jump(next) {
      if (destroyed || !Number.isFinite(next)) return api;
      stop();
      position = target = next;
      velocity = 0;
      onUpdate(position);
      return api;
    },
    stop() { stop(); return api; },
    destroy() { stop(); destroyed = true; },
  };
  return api;
}

