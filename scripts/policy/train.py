"""Train the tiny self-healing policy of the hero take-over (issue #10): imitation + DAgger.

The toy service, the teacher and the runbook live in TypeScript (src/scripts/policy/service.ts,
expert.ts, rules.ts); this script never re-implements them. It shells out to bun:
  bun scripts/policy/rollouts.ts export ...   (observation, teacher action) pairs as JSON Lines
  bun scripts/policy/rollouts.ts score ...    the evaluation, on the exact float16 weights shipped

1. Behaviour cloning: the teacher drives, an MLP learns its action from the observation alone
   (the teacher sees the hidden fault, the policy only the noisy dashboard).
2. DAgger (Ross et al., 2011): the current policy drives (the teacher with probability beta,
   halved each round), every state it visits is labelled with what the teacher would do there,
   the data is aggregated and the policy retrained. That teaches it to recover from its own
   mistakes, which plain cloning never shows it.
Loss: cross-entropy weighted by inverse square-root class frequency (most ticks are 'noop'), and
the tick-0 rows (onset: the observation is identical across faults, so the label is a guess)
count 0.1.

Checkpoints are scored on validation seeds 2000-2299 (training uses 0-299 by default; the tests
use 1000-1099). public/policy/policy.bin is overwritten only when the best checkpoint beats the
existing file on that validation score (gates of tests/policy.test.ts passed, then recovery,
then return), like scripts/nca/train.py. --force skips the comparison. It also rewrites
tests/fixtures/policy-parity.json: real observations and the logits of the float16 weights.

policy.bin (decoded by src/scripts/policy/net.ts), little-endian:
  "POL1", uint16 L, uint16 dims[L+1], then per layer float16 w[out][in], b[out]. ReLU between.

Run (PyTorch is not a project dependency, so use a throwaway venv), from the repo root:
  uv venv /tmp/nca-venv && VIRTUAL_ENV=/tmp/nca-venv uv pip install torch numpy
  /tmp/nca-venv/bin/python scripts/policy/train.py                  # --device auto (cuda, else cpu)
  /tmp/nca-venv/bin/python scripts/policy/train.py --device mps     # or cpu / cuda
  /tmp/nca-venv/bin/python scripts/policy/train.py --hidden 32,32 --rounds 8 --out /tmp/p.bin
Then: bun test tests/policy.test.ts

Devices: cpu, mps (Apple) and cuda all work; 'auto' takes cuda when present, else cpu, because a
~1k-parameter MLP is faster on the CPU than on mps. Seeded: on cpu the same command gives the same
weights; mps and cuda may differ in the last bits.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile
import time

import numpy as np
import torch
from torch import nn

ROOT = pathlib.Path(__file__).resolve().parents[2]
ACTIONS = ["noop", "retry", "rollback", "isolate", "scale", "block_merge", "page_human"]
VISITOR = ["latency", "node_down", "surge"]


def pick_device(name: str) -> torch.device:
    if name == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if name == "cuda" and not torch.cuda.is_available():
        sys.exit("cuda requested but torch.cuda.is_available() is False")
    if name == "mps" and not torch.backends.mps.is_available():
        sys.exit("mps requested but torch.backends.mps.is_available() is False")
    return torch.device(name)


def bun(*args: str) -> str:
    return subprocess.run(["bun", "scripts/policy/rollouts.ts", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def read_rows(path: pathlib.Path) -> list[dict]:
    with path.open() as f:
        return [json.loads(line) for line in f]


class MLP(nn.Module):
    def __init__(self, dims: list[int]) -> None:
        super().__init__()
        self.layers = nn.ModuleList(nn.Linear(a, b) for a, b in zip(dims[:-1], dims[1:]))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for i, l in enumerate(self.layers):
            x = l(x)
            if i < len(self.layers) - 1:
                x = torch.relu(x)
        return x


def fit(model: MLP, rows: list[dict], device: torch.device, epochs: int, lr: float, seed: int) -> float:
    x = torch.tensor([r["obs"] for r in rows], dtype=torch.float32, device=device)
    y = torch.tensor([r["action"] for r in rows], dtype=torch.long, device=device)
    counts = np.bincount([r["action"] for r in rows], minlength=len(ACTIONS)).astype(np.float64)
    cw = np.where(counts > 0, 1 / np.sqrt(np.maximum(counts, 1)), 0)
    cw = cw / (cw * counts).sum() * counts.sum()
    class_w = torch.tensor(cw, dtype=torch.float32, device=device)
    onset_w = torch.tensor([0.1 if r.get("onset") else 1.0 for r in rows], dtype=torch.float32, device=device)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    g = torch.Generator().manual_seed(seed)
    n = len(rows)
    loss_v = 0.0
    for _ in range(epochs):
        perm = torch.randperm(n, generator=g).to(device)
        total, weight = 0.0, 0.0
        for i in range(0, n, 1024):
            idx = perm[i : i + 1024]
            logits = model(x[idx])
            w = class_w[y[idx]] * onset_w[idx]
            loss = (nn.functional.cross_entropy(logits, y[idx], reduction="none") * w).sum() / w.sum()
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * w.sum().item()
            weight += w.sum().item()
        sched.step()
        loss_v = total / weight
    return loss_v


def half_layers(model: MLP) -> list[tuple[np.ndarray, np.ndarray]]:
    return [(l.weight.detach().cpu().numpy().astype(np.float16), l.bias.detach().cpu().numpy().astype(np.float16)) for l in model.layers]


def write_bin(model: MLP, path: pathlib.Path) -> None:
    layers = half_layers(model)
    dims = [layers[0][0].shape[1]] + [w.shape[0] for w, _ in layers]
    out = b"POL1" + struct.pack("<H", len(layers)) + struct.pack(f"<{len(dims)}H", *dims)
    for w, b in layers:
        out += w.astype("<f2").tobytes() + b.astype("<f2").tobytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)


def logits_f16(layers: list[tuple[np.ndarray, np.ndarray]], obs: np.ndarray) -> np.ndarray:
    x = obs.astype(np.float64)
    for i, (w, b) in enumerate(layers):
        x = w.astype(np.float64) @ x + b.astype(np.float64)
        if i < len(layers) - 1:
            x = np.maximum(x, 0)
    return x


def score(path: pathlib.Path, seeds: str) -> dict:
    return json.loads(bun("score", "--policy", str(path), "--seeds", seeds))


def gates(s: dict) -> tuple[int, int, float, float]:
    """(gates of tests/policy.test.ts passed, out of 5; better than the runbook somewhere; recovery; return)."""
    passed = 0
    for f in VISITOR:
        p, r, n = s[f]["policy"], s[f]["rules"], s[f]["noop"]
        passed += p["recoveryRate"] >= 0.9 and p["recoveryRate"] >= r["recoveryRate"] and p["meanReturn"] > n["meanReturn"] and p["meanTicksToRecover"] <= 12
    bd, off = s["bad_deploy"]["policy"], s["bad_deploy_off"]["policy"]
    seeds = sum(off["firstOutcome"].values())
    passed += bd["outcomes"]["caught"] >= 0.95 * seeds
    passed += off["firstOutcome"]["shipped"] == seeds and off["outcomes"]["recovered"] >= 0.9 * seeds
    better = any(
        s[f]["policy"]["recoveryRate"] > s[f]["rules"]["recoveryRate"] or s[f]["policy"]["meanReturn"] > s[f]["rules"]["meanReturn"] + 1
        for f in VISITOR + ["bad_deploy"]
    )
    rec = sum(s[f]["policy"]["recoveryRate"] for f in VISITOR + ["bad_deploy", "bad_deploy_off"])
    ret = sum(s[f]["policy"]["meanReturn"] for f in VISITOR + ["bad_deploy", "bad_deploy_off"])
    return (passed, int(better), round(rec, 4), round(ret, 2))


def show(s: dict) -> str:
    return "  ".join(f"{f}: {s[f]['policy']['recoveryRate']:.2f}/{s[f]['policy']['meanReturn']:.1f}" for f in VISITOR + ["bad_deploy", "bad_deploy_off"])


def table(s: dict) -> None:
    print(f"{'scenario':15} {'controller':8} {'recovery':>8} {'return':>7} {'ticks':>6}  outcomes")
    for f in VISITOR + ["bad_deploy", "bad_deploy_off", "overload"]:
        for c in ["noop", "rules", "expert", "policy"]:
            r = s[f][c]
            outs = ", ".join(f"{k} {v}" for k, v in r["outcomes"].items() if v)
            print(f"{f:15} {c:8} {r['recoveryRate'] * 100:7.0f}% {r['meanReturn']:7.1f} {r['meanTicksToRecover']:6.1f}  {outs}")


def parity(model: MLP, rows: list[dict], path: pathlib.Path, n: int = 24) -> None:
    rng = np.random.default_rng(0)
    by_action: dict[int, list[dict]] = {}
    for r in rows:
        by_action.setdefault(r["action"], []).append(r)
    picked: list[dict] = []
    while len(picked) < n:
        for a in sorted(by_action):
            if len(picked) < n:
                picked.append(by_action[a][int(rng.integers(len(by_action[a])))])
    layers = half_layers(model)
    fx = [{"obs": r["obs"], "logits": [round(float(v), 6) for v in logits_f16(layers, np.array(r["obs"], dtype=np.float32))]} for r in picked]
    path.write_text(json.dumps(fx) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--device", default="auto", choices=["auto", "cpu", "mps", "cuda"])
    ap.add_argument("--hidden", default="32", help="hidden layer widths, comma-separated (32 → 1,031 params)")
    ap.add_argument("--rounds", type=int, default=6, help="DAgger rounds after behaviour cloning")
    ap.add_argument("--beta", type=float, default=0.5, help="teacher share in DAgger round 1, halved each round")
    ap.add_argument("--seeds", default="0-299", help="behaviour-cloning seeds (DAgger round r uses them shifted by 10000 + r × count)")
    ap.add_argument("--val-seeds", default="2000-2299")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=pathlib.Path, default=ROOT / "public/policy/policy.bin")
    ap.add_argument("--parity", type=pathlib.Path, default=ROOT / "tests/fixtures/policy-parity.json")
    ap.add_argument("--work", type=pathlib.Path, help="keep rollouts and checkpoints here (default: a temp dir)")
    ap.add_argument("--force", action="store_true", help="overwrite --out even if it scores better")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = pick_device(args.device)
    work = args.work or pathlib.Path(tempfile.mkdtemp(prefix="policy-"))
    work.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    print(f"device {device}, work dir {work}")

    obs_size = len(json.loads(bun("export", "--out", "/dev/stdout", "--seeds", "0-0").splitlines()[0])["obs"])
    dims = [obs_size] + [int(h) for h in args.hidden.split(",")] + [len(ACTIONS)]
    model = MLP(dims).to(device)
    params = sum(p.numel() for p in model.parameters())
    print(f"MLP {dims}: {params} params, {6 + 2 * len(dims) + 2 * params} bytes")

    lo, hi = (int(v) for v in args.seeds.split("-"))
    span = hi - lo + 1
    bun("export", "--out", str(work / "r0.jsonl"), "--seeds", args.seeds)
    rows = read_rows(work / "r0.jsonl")
    best: tuple | None = None
    best_path = work / "best.bin"
    best_rows = rows
    for rnd in range(args.rounds + 1):
        if rnd > 0:
            beta = args.beta * 0.5 ** (rnd - 1)
            seeds = f"{10000 + lo + rnd * span}-{10000 + hi + rnd * span}"  # fresh seeds, away from 1000-1099 and validation
            bun("export", "--out", str(work / f"r{rnd}.jsonl"), "--seeds", seeds, "--policy", str(work / f"c{rnd - 1}.bin"), "--beta", str(beta), "--round", str(rnd))
            rows += read_rows(work / f"r{rnd}.jsonl")
        loss = fit(model, rows, device, args.epochs, args.lr * (1 if rnd == 0 else 0.5), args.seed + rnd)
        ckpt = work / f"c{rnd}.bin"
        write_bin(model, ckpt)
        s = score(ckpt, args.val_seeds)
        g = gates(s)
        print(f"round {rnd} ({len(rows)} states, loss {loss:.4f}, {time.time() - t0:.0f}s): gates {g[0]}/5, better {g[1]}  {show(s)}")
        if best is None or g > best:
            best = g
            shutil.copy(ckpt, best_path)
            torch.save(model.state_dict(), work / "best.pt")
            best_rows = list(rows)

    assert best is not None
    if args.out.exists() and not args.force:
        old = gates(score(args.out, args.val_seeds))
        print(f"existing {args.out}: {old}, new best: {best}")
        if not best > old:
            print("not better than the existing weights: left as is")
            return
    shutil.copy(best_path, args.out)
    model.load_state_dict(torch.load(work / "best.pt"))
    parity(model, best_rows, args.parity)
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes, {params} params) and {args.parity} in {time.time() - t0:.0f}s on {device}")
    print("evaluation seeds 1000-1099:")
    table(score(args.out, "1000-1099"))


if __name__ == "__main__":
    main()
