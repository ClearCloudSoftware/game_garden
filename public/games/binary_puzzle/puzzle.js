// Binary puzzle (Takuzu / Binairo) logic, shared by index.html and puzzle.test.js.
// A grid is a flat row-major array of 0, 1 or -1 (empty). Lines 0..n-1 are rows, n..2n-1 are columns.
(function () {
  const cache = {}

  const cellOf = (n, l, k) => (l < n ? l * n + k : k * n + l - n)
  const bits = m => { let c = 0; for (; m; m &= m - 1) c++; return c }
  // Cells flanked by two set bits of m (both on one side, or one each side): rule 2 forces them the other way.
  const squeezed = (m, full) => (m << 1 & m << 2 | m >> 1 & m >> 2 | m << 1 & m >> 1) & full

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // Every legal line of length n as a bitmask (bit k = cell k): balanced, never three equal in a row.
  function legalLines(n) {
    if (cache[n]) return cache[n]
    const full = (1 << n) - 1, out = []
    for (let m = 0; m <= full; m++) {
      const z = ~m & full
      if (bits(m) * 2 === n && !(m & m >> 1 & m >> 2) && !(z & z >> 1 & z >> 2)) out.push(m)
    }
    return (cache[n] = out)
  }

  // Known-cell mask and ones mask of line l.
  function read(g, n, l) {
    let k = 0, v = 0
    for (let i = 0; i < n; i++) {
      const x = g[cellOf(n, l, i)]
      if (x >= 0) { k |= 1 << i; v |= x << i }
    }
    return [k, v]
  }

  // A random full grid obeying all four rules, stacked row by row from legal lines.
  function complete(n) {
    const lines = legalLines(n), full = (1 << n) - 1, half = n / 2
    for (;;) {
      const order = shuffle(lines.slice()), rows = [], ones = Array(n).fill(0)
      let budget = 50000 // ponytail: unlucky starts restart instead of smarter pruning
      const add = (m, d) => { for (let c = 0; c < n; c++) ones[c] += d * (m >> c & 1) }
      const fill = r => {
        if (r === n) {
          const cols = new Set()
          for (let c = 0; c < n; c++) cols.add(rows.reduce((m, row, i) => m | (row >> c & 1) << i, 0))
          return cols.size === n
        }
        for (const m of order) {
          if (--budget < 0) return false
          if (rows.includes(m)) continue
          if (r > 1 && ~(rows[r - 2] ^ rows[r - 1]) & ~(rows[r - 1] ^ m) & full) continue
          add(m, 1)
          if (ones.every(o => o <= half && r + 1 - o <= half)) {
            rows.push(m)
            if (fill(r + 1)) return true
            rows.pop()
          }
          add(m, -1)
        }
        return false
      }
      if (fill(0)) return rows.flatMap(m => Array.from({ length: n }, (_, c) => m >> c & 1))
    }
  }

  // Fill every cell the rules force, until nothing changes. Mutates and returns g.
  // Easy: pairs, gaps and full counts. Hard: intersect every legal completion of a line that
  // doesn't copy a finished line, which covers any deduction a single line allows.
  function deduce(g, n, hard) {
    const lines = legalLines(n), full = (1 << n) - 1, half = n / 2
    for (let moved = true; moved; ) {
      moved = false
      const done = [new Set(), new Set()]
      if (hard) for (let l = 0; l < 2 * n; l++) {
        const [k, v] = read(g, n, l)
        if (k === full) done[+(l >= n)].add(v)
      }
      for (let l = 0; l < 2 * n; l++) {
        const [k, v] = read(g, n, l), open = ~k & full
        if (!open) continue
        let one, zero
        if (hard) {
          let and = full, or = 0
          for (const p of lines) if ((p & k) === v && !done[+(l >= n)].has(p)) { and &= p; or |= p }
          one = and & open
          zero = ~or & open
        } else {
          const z = k & ~v
          one = (squeezed(z, full) | (bits(z) === half ? full : 0)) & open
          zero = (squeezed(v, full) | (bits(v) === half ? full : 0)) & open
        }
        for (let i = 0; i < n; i++) {
          if (one >> i & 1) { g[cellOf(n, l, i)] = 1; moved = true }
          else if (zero >> i & 1) { g[cellOf(n, l, i)] = 0; moved = true }
        }
      }
    }
    return g
  }

  const solves = (g, n, hard) => !deduce(g.slice(), n, hard).includes(-1)

  // Strip clues from a random solution while the chosen rules can still finish it, so the puzzle
  // has exactly one solution and never needs a guess.
  function generate(n, hard) {
    for (let tries = 0; ; tries++) {
      const solution = complete(n), givens = solution.slice()
      for (const i of shuffle([...solution.keys()])) {
        givens[i] = -1
        if (!solves(givens, n, hard)) givens[i] = solution[i]
      }
      // A hard deal the easy rules already finish isn't hard: deal again, a few times at most.
      if (!hard || tries === 5 || !solves(givens, n, false)) return { n, givens, solution }
    }
  }

  // Rule check of a player's grid: cells in a trio, and each line's state:
  // '' still open, 'ok' full and legal, 'bad' breaks a rule (trio, too many of a digit, copy of another line).
  function audit(g, n) {
    const trio = new Set(), state = [], seen = new Map()
    for (let l = 0; l < 2 * n; l++) {
      let ones = 0, zeros = 0, bad = false, key = l < n ? 'r' : 'c'
      for (let i = 0; i < n; i++) {
        const c = cellOf(n, l, i), x = g[c]
        if (x === 1) ones++
        else if (x === 0) zeros++
        key += x
        if (i > 1 && x >= 0 && x === g[cellOf(n, l, i - 1)] && x === g[cellOf(n, l, i - 2)]) {
          bad = true
          trio.add(c).add(cellOf(n, l, i - 1)).add(cellOf(n, l, i - 2))
        }
      }
      if (ones * 2 > n || zeros * 2 > n) bad = true
      const full = ones + zeros === n
      if (full && !bad) {
        if (seen.has(key)) { bad = true; state[seen.get(key)] = 'bad' }
        else seen.set(key, l)
      }
      state[l] = bad ? 'bad' : full ? 'ok' : ''
    }
    return { trio, state, solved: state.every(s => s === 'ok') }
  }

  const api = { legalLines, deduce, generate, audit }
  if (typeof module === 'object' && module.exports) module.exports = api
  else window.Binary = api
})()
