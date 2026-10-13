// Física Verlet mínima (pontos + restrições de distância + chão/paredes), para rodar DENTRO do bake().
// Determinística: mesmo init → mesmos frames. Unidades lógicas (px do espaço w×h), tempo em segundos.
//
// const world = verlet({ gravity: [0, 2400], damping: 0.995, iterations: 8, bounds: { x0: 0, y0: -1e9, x1: w, y1: h, bounce: 0.3, friction: 0.8 } });
// const a = world.point(x, y, { pinned: true, radius: 0 });
// world.link(a, b, { stiffness: 1 });   // comprimento = distância atual (ou { length })
// world.step(dt, (pt) => [fx, fy])       // força extra opcional por ponto (vento etc.), em px/s²
// snapshot: world.points.map((p) => [p.x, p.y])
//
// 3D opcional (tecido, bandeira): world.point(x, y, { z }) e gravity/força com 3º componente ([gx, gy, gz]).
// As restrições usam a distância 3D; os limites (bounds) só olham x/y. Sem z, tudo continua 2D (z = 0).

export function verlet({ gravity = [0, 2400], damping = 0.995, iterations = 8, bounds = null } = {}) {
  const points = [];
  const links = [];

  const point = (x, y, { pinned = false, radius = 0, mass = 1, z = 0 } = {}) => {
    const p = { x, y, z, px: x, py: y, pz: z, pinned, radius, mass, i: points.length };
    points.push(p);
    return p;
  };

  const link = (a, b, { length, stiffness = 1 } = {}) => {
    const l = { a, b, length: length ?? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), stiffness };
    links.push(l);
    return l;
  };

  const collide = (p) => {
    if (!bounds || p.pinned) return;
    const { x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity, bounce = 0.3, friction = 0.8 } = bounds;
    const r = p.radius;
    const vx = p.x - p.px;
    const vy = p.y - p.py;
    if (p.y > y1 - r) {
      p.y = y1 - r;
      p.py = p.y + vy * bounce;
      p.px = p.x - vx * friction;
    } else if (p.y < y0 + r) {
      p.y = y0 + r;
      p.py = p.y + vy * bounce;
    }
    if (p.x > x1 - r) {
      p.x = x1 - r;
      p.px = p.x + vx * bounce;
    } else if (p.x < x0 + r) {
      p.x = x0 + r;
      p.px = p.x + vx * bounce;
    }
  };

  const step = (dt, force) => {
    const dt2 = dt * dt;
    for (const p of points) {
      if (p.pinned) continue;
      let ax = gravity[0];
      let ay = gravity[1];
      let az = gravity[2] || 0;
      if (force) {
        const f = force(p);
        if (f) {
          ax += f[0] / p.mass;
          ay += f[1] / p.mass;
          if (f[2]) az += f[2] / p.mass;
        }
      }
      const vx = (p.x - p.px) * damping;
      const vy = (p.y - p.py) * damping;
      const vz = (p.z - p.pz) * damping;
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.x += vx + ax * dt2;
      p.y += vy + ay * dt2;
      p.z += vz + az * dt2;
    }
    for (let k = 0; k < iterations; k++) {
      for (const l of links) {
        const { a, b } = l;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((d - l.length) / d) * l.stiffness;
        const wa = a.pinned ? 0 : b.pinned ? 1 : 0.5;
        const wb = b.pinned ? 0 : a.pinned ? 1 : 0.5;
        a.x += dx * diff * wa;
        a.y += dy * diff * wa;
        a.z += dz * diff * wa;
        b.x -= dx * diff * wb;
        b.y -= dy * diff * wb;
        b.z -= dz * diff * wb;
      }
      for (const p of points) collide(p);
    }
  };

  return { points, links, point, link, step };
}
