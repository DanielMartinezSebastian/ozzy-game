const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Laberinto por backtracking (DFS). 1 = muro, 0 = libre. Tamaño (2w+1) x (2h+1).
export function generateMaze(w, h, loops = 0.12) {
  const W = w * 2 + 1
  const H = h * 2 + 1
  const grid = Array.from({ length: H }, () => Array(W).fill(1))
  const visited = new Set(['0,0'])
  const stack = [[0, 0]]
  grid[1][1] = 0

  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]
    const next = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]).find(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !visited.has(`${nx},${ny}`)
    })
    if (!next) { stack.pop(); continue }
    const [dx, dy] = next
    const nx = cx + dx, ny = cy + dy
    visited.add(`${nx},${ny}`)
    grid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0
    grid[ny * 2 + 1][nx * 2 + 1] = 0
    stack.push([nx, ny])
  }

  // Abre algunos muros extra para crear bucles (menos callejones, más combate)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== 1 || Math.random() > loops) continue
      const horiz = grid[y][x - 1] === 0 && grid[y][x + 1] === 0 && grid[y - 1][x] === 1 && grid[y + 1][x] === 1
      const vert = grid[y - 1][x] === 0 && grid[y + 1][x] === 0 && grid[y][x - 1] === 1 && grid[y][x + 1] === 1
      if (horiz || vert) grid[y][x] = 0
    }
  }
  return grid
}
