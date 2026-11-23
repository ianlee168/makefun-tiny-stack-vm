import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Tiny stack VM for make.fun's ISA v1 (see kit ISA.md).
// One run answers every instance in MAKEFUN_INPUT_DIR.
function run(p, inp) {
  const st = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const mem = new Int32Array(256);
  const out = Buffer.alloc(65536);
  let ol = 0, pc = 0, steps = 0, ip = 0;
  const t = (c) => [out.subarray(0, ol), c];
  for (;;) {
    if (steps++ >= 1000000) return t(10);
    if (pc < 0 || pc >= p.length) return t(9);
    const op = p[pc];
    const il = op === 1 ? 1 : op === 2 ? 4 : op >= 0x30 && op <= 0x33 ? 2 : 0;
    if (pc + 1 + il > p.length) return t(9);
    const nx = pc + 1 + il;
    const off = () => { const o = p[pc + 1] | p[pc + 2] << 8; return o >= 32768 ? o - 65536 : o; };
    let np = nx;
    switch (op) {
      case 0x00: return t(0);
      case 0x01: if (sp === 256) return t(3); st[sp++] = (p[pc + 1] << 24) >> 24; break;
      case 0x02: if (sp === 256) return t(3); st[sp++] = p[pc + 1] | p[pc + 2] << 8 | p[pc + 3] << 16 | p[pc + 4] << 24; break;
      case 0x03: if (sp < 1) return t(2); sp--; break;
      case 0x04: if (sp < 1) return t(2); if (sp === 256) return t(3); st[sp] = st[sp - 1]; sp++; break;
      case 0x05: if (sp < 2) return t(2); { const a = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; } break;
      case 0x06: if (sp < 2) return t(2); if (sp === 256) return t(3); st[sp] = st[sp - 2]; sp++; break;
      case 0x07: if (sp < 3) return t(2); { const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; } break;
      case 0x10: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = (a + b) | 0; } break;
      case 0x11: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = (a - b) | 0; } break;
      case 0x12: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = Math.imul(a, b); } break;
      case 0x13: if (sp < 2) return t(2); { const b = st[sp - 1], a = st[sp - 2]; if (b === 0) return t(4); sp -= 2; st[sp++] = (a / b) | 0; } break;
      case 0x14: if (sp < 2) return t(2); { const b = st[sp - 1], a = st[sp - 2]; if (b === 0) return t(4); sp -= 2; st[sp++] = (a % b) | 0; } break;
      case 0x15: if (sp < 2) return t(2); { const b = st[sp - 1], a = st[sp - 2]; if (b === 0) return t(4); sp -= 2; st[sp++] = ((a >>> 0) / (b >>> 0)) | 0; } break;
      case 0x16: if (sp < 2) return t(2); { const b = st[sp - 1], a = st[sp - 2]; if (b === 0) return t(4); sp -= 2; st[sp++] = ((a >>> 0) % (b >>> 0)) | 0; } break;
      case 0x17: if (sp < 1) return t(2); st[sp - 1] = (-st[sp - 1]) | 0; break;
      case 0x18: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = a & b; } break;
      case 0x19: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = a | b; } break;
      case 0x1a: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = a ^ b; } break;
      case 0x1b: if (sp < 1) return t(2); st[sp - 1] = ~st[sp - 1]; break;
      case 0x1c: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = a << (b & 31); } break;
      case 0x1d: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = a >> (b & 31); } break;
      case 0x1e: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = (a >>> (b & 31)) | 0; } break;
      case 0x20: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = a === b ? 1 : 0; } break;
      case 0x21: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = a < b ? 1 : 0; } break;
      case 0x22: if (sp < 2) return t(2); { const b = st[--sp], a = st[--sp]; st[sp++] = (a >>> 0) < (b >>> 0) ? 1 : 0; } break;
      case 0x30: np = nx + off(); break;
      case 0x31: if (sp < 1) return t(2); { const v = st[--sp]; if (v === 0) np = nx + off(); } break;
      case 0x32: if (sp < 1) return t(2); { const v = st[--sp]; if (v !== 0) np = nx + off(); } break;
      case 0x33: if (cp === 64) return t(7); cs[cp++] = nx; np = p[pc + 1] | p[pc + 2] << 8; break;
      case 0x34: if (cp === 0) return t(8); np = cs[--cp]; break;
      case 0x40: if (sp < 1) return t(2); { const a = st[sp - 1]; if (a < 0 || a > 255) return t(6); st[sp - 1] = mem[a]; } break;
      case 0x41: if (sp < 2) return t(2); { const a = st[sp - 1], v = st[sp - 2]; if (a < 0 || a > 255) return t(6); sp -= 2; mem[a] = v; } break;
      case 0x50: if (sp < 1) return t(2); { const v = st[sp - 1]; const s = String(v); if (ol + s.length > 65536) return t(11); sp--; ol += out.write(s, ol, 'ascii'); } break;
      case 0x51: if (sp < 1) return t(2); { const v = st[sp - 1]; if (ol + 1 > 65536) return t(11); sp--; out[ol++] = v & 255; } break;
      case 0x52: if (sp === 256) return t(3); st[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: if (sp < 1) return t(2); return t(st[--sp] & 255);
      default: return t(5);
    }
    pc = np;
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const [out, code] = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), code + '\n');
}
