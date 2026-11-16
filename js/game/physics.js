// 简单 AABB 体素碰撞（实体位置 = 脚底中心）
const EPS = 0.001;

export function collides(world, x, y, z, hw, h) {
  const x0 = Math.floor(x - hw + EPS), x1 = Math.floor(x + hw - EPS);
  const y0 = Math.floor(y + EPS), y1 = Math.floor(y + h - EPS);
  const z0 = Math.floor(z - hw + EPS), z1 = Math.floor(z + hw - EPS);
  for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++)
    if (world.solid(xx, yy, zz)) return true;
  return false;
}

// e: {x,y,z,vy,hw,h,onGround,canStep}
export function moveEntity(world, e, dx, dz, dt, gravity = 24) {
  e.vy -= gravity * dt;
  if (e.vy < -30) e.vy = -30;
  const dy = e.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dy)) / 0.2));
  let blocked = false;
  for (let s = 0; s < steps; s++) {
    // X
    const sx = dx / steps;
    if (sx !== 0) {
      if (!collides(world, e.x + sx, e.y, e.z, e.hw, e.h)) e.x += sx;
      else if (e.canStep && e.onGround && !collides(world, e.x + sx, e.y + 1.0, e.z, e.hw, e.h) && !collides(world, e.x, e.y + 1.0, e.z, e.hw, e.h)) { e.y += 1.0; e.x += sx; e.stepped = 0.25; }
      else blocked = true;
    }
    const sz = dz / steps;
    if (sz !== 0) {
      if (!collides(world, e.x, e.y, e.z + sz, e.hw, e.h)) e.z += sz;
      else if (e.canStep && e.onGround && !collides(world, e.x, e.y + 1.0, e.z + sz, e.hw, e.h) && !collides(world, e.x, e.y + 1.0, e.z, e.hw, e.h)) { e.y += 1.0; e.z += sz; e.stepped = 0.25; }
      else blocked = true;
    }
    const sy = dy / steps;
    if (!collides(world, e.x, e.y + sy, e.z, e.hw, e.h)) { e.y += sy; }
    else {
      if (sy < 0) { e.y = Math.floor(e.y + sy) + 1; if (collides(world, e.x, e.y, e.z, e.hw, e.h)) e.y += 0; }
      e.vy = 0;
    }
  }
  e.onGround = collides(world, e.x, e.y - 0.05, e.z, e.hw, e.h);
  if (e.onGround && e.vy < 0) e.vy = 0;
  // 卡入方块时向上推出
  if (collides(world, e.x, e.y, e.z, e.hw, e.h)) { e.y = Math.floor(e.y) + 1; }
  return blocked;
}
