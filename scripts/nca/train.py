"""Train the neural cellular automaton that grows the GR monogram.

A from-scratch implementation of the "regenerating" experiment in Mordvintsev et
al., "Growing Neural Cellular Automata" (Distill, 2020,
https://distill.pub/2020/growing-ca/). Every cell holds 16 channels (RGBA plus 12
hidden ones). Each step, a cell perceives its 3x3 neighbourhood through fixed
identity and Sobel filters, a two-layer 1x1 network turns that into an update,
a random half of the cells apply it, and cells with no living neighbour die.
Training uses a sample pool and damage shaped like what visitors do on the page
(brush strokes dragged across it, full-height cuts between the letters, round
bites), so the pattern learns to persist and to heal.

The browser runs the same model in src/scripts/nca/model.ts. Anything that
changes the update rule here (kernels, padding, channel order, alive mask, fire
rate) has to change there too, or the shipped weights stop working.

Files:
  public/nca/gr.json        weights the page fetches (rounded to 5 significant digits).
                            Written only when an evaluation beats the best so far; with
                            --init, the starting weights' own score is the bar to beat.
  scripts/nca/target.json   the training target, premultiplied RGBA, row-major. Read,
                            not regenerated, unless you pass --write-target.

Run (PyTorch is not a project dependency, so use a throwaway venv):
  uv venv /tmp/nca-venv && VIRTUAL_ENV=/tmp/nca-venv uv pip install torch numpy pillow fonttools brotli
  /tmp/nca-venv/bin/python scripts/nca/train.py            # from the repo root, after bun install

On an Apple M3 Pro (mps) the default 12000 iterations take about 48 minutes
(about 0.24 s each, plus an evaluation every 1000); CPU is roughly three times
slower. Training on mps is not bit-reproducible: the same command and seed give
a different, similar model.

The shipped weights are one from-scratch run with these defaults:
  train.py --seed 6          # 48 min; best checkpoint at iteration 11000, batch loss ~4e-3
Fine-tuning the earlier bites-only model on strokes (--init, at 5e-4 and 1e-3)
was tried first and stalled: after a cut between the letters it kept growing the
lime block into the G. Learning strokes from the start fixed that.
Then check with `bun test tests/nca.test.ts`.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import pathlib
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONT = ROOT / "node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2"

SIZE = 56          # grid side, in cells
CAP_HEIGHT = 26    # letter height, in cells
CHANNELS = 16      # RGBA + 12 hidden
HIDDEN = 128
FIRE_RATE = 0.5    # probability that a cell applies its update on a given step
ALIVE = 0.1        # a cell lives while some cell in its 3x3 neighbourhood has alpha > ALIVE

INK = np.array([10, 10, 10]) / 255     # #0A0A0A
LIME = np.array([200, 255, 0]) / 255   # #C8FF00, the hero's highlight


# --- target ---------------------------------------------------------------

def load_font(px: int) -> ImageFont.FreeTypeFont:
    """Space Grotesk at weight 700. PIL can't read woff2 or variable axes, so pin
    the axis and re-save as a plain TrueType in memory."""
    font = instancer.instantiateVariableFont(TTFont(FONT), {"wght": 700})
    font.flavor = None
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, px)


def glyph_masks(height: int) -> tuple[np.ndarray, np.ndarray]:
    """Coverage masks for G and R, both scaled so the cap height is `height` cells."""
    font = load_font(400)
    ims = []
    for ch in "GR":
        im = Image.new("L", (800, 800), 0)
        ImageDraw.Draw(im).text((100, 100), ch, font=font, fill=255)
        ims.append(im)
    boxes = [np.array(im).nonzero() for im in ims]
    top = min(ys.min() for ys, _ in boxes)
    bottom = max(ys.max() for ys, _ in boxes) + 1
    scale = height / (bottom - top)
    out = []
    for im, (_, xs) in zip(ims, boxes):
        crop = im.crop((xs.min(), top, xs.max() + 1, bottom))
        w = round(crop.width * scale)
        out.append(np.asarray(crop.resize((w, height), Image.LANCZOS), dtype=np.float64) / 255)
    return out[0], out[1]


def make_target(highlight: bool) -> np.ndarray:
    """(SIZE, SIZE, 4) premultiplied RGBA: a black G, then a black R, which with
    `highlight` sits on a lime block like the surname in the hero."""
    g, r = glyph_masks(CAP_HEIGHT)
    gap, pad_x, pad_y = 3, 2, 3
    block_w = r.shape[1] + 2 * pad_x if highlight else r.shape[1]
    width = g.shape[1] + gap + block_w
    x0 = (SIZE - width) // 2
    y0 = (SIZE - CAP_HEIGHT) // 2

    rgb = np.zeros((SIZE, SIZE, 3))
    alpha = np.zeros((SIZE, SIZE))

    def over(ys: slice, xs: slice, color: np.ndarray, cover: np.ndarray) -> None:
        cover = np.clip(cover, 0, 1)
        rgb[ys, xs] = color * cover[..., None] + rgb[ys, xs] * (1 - cover[..., None])
        alpha[ys, xs] = cover + alpha[ys, xs] * (1 - cover)

    over(slice(y0, y0 + CAP_HEIGHT), slice(x0, x0 + g.shape[1]), INK, g)
    bx = x0 + g.shape[1] + gap
    if highlight:
        ys = slice(y0 - pad_y, y0 + CAP_HEIGHT + pad_y)
        xs = slice(bx, bx + block_w)
        over(ys, xs, LIME, np.ones((CAP_HEIGHT + 2 * pad_y, block_w)))
        bx += pad_x
    over(slice(y0, y0 + CAP_HEIGHT), slice(bx, bx + r.shape[1]), INK, r)
    return np.concatenate([rgb, alpha[..., None]], axis=-1).astype(np.float32)


# --- model ----------------------------------------------------------------

class NCA(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        ident = torch.tensor([[0.0, 0, 0], [0, 1, 0], [0, 0, 0]])
        sobel_x = torch.tensor([[-1.0, 0, 1], [-2, 0, 2], [-1, 0, 1]]) / 8
        kernels = torch.stack([ident, sobel_x, sobel_x.T])[:, None]  # (3, 1, 3, 3)
        # Depthwise: perception channel c*3+k is filter k applied to state channel c.
        self.register_buffer("kernels", kernels.repeat(CHANNELS, 1, 1, 1))
        self.w1 = nn.Conv2d(3 * CHANNELS, HIDDEN, 1)
        self.w2 = nn.Conv2d(HIDDEN, CHANNELS, 1, bias=False)
        nn.init.zeros_(self.w2.weight)  # start as the identity map: do-nothing updates

    @staticmethod
    def alive(x: torch.Tensor) -> torch.Tensor:
        return F.max_pool2d(x[:, 3:4], 3, stride=1, padding=1) > ALIVE

    def step(self, x: torch.Tensor) -> torch.Tensor:
        pre = self.alive(x)
        perception = F.conv2d(x, self.kernels, padding=1, groups=CHANNELS)  # zero padding
        dx = self.w2(F.relu(self.w1(perception)))
        fire = (torch.rand(x.shape[0], 1, SIZE, SIZE, device=x.device) < FIRE_RATE).float()
        x = x + dx * fire
        return x * (pre & self.alive(x)).float()

    def forward(self, x: torch.Tensor, steps: int) -> torch.Tensor:
        for _ in range(steps):
            x = self.step(x)
        return x


def seed_state(n: int, device: torch.device) -> torch.Tensor:
    x = torch.zeros(n, CHANNELS, SIZE, SIZE, device=device)
    x[:, 3:, SIZE // 2, SIZE // 2] = 1.0
    return x


_yy, _xx = np.mgrid[0:SIZE, 0:SIZE] + 0.5


def circle_mask(cx: float, cy: float, r: float) -> np.ndarray:
    """Cells whose centre (x+0.5, y+0.5) lies inside the circle, grid coordinates."""
    return (_xx - cx) ** 2 + (_yy - cy) ** 2 < r * r


def stroke_mask(lines: list[tuple[float, float, float, float]], r: float) -> np.ndarray:
    """A drag on the page: the brush stamped every ~3 cells along each line.
    Endpoints are fractions of the grid, as in tests/nca.test.ts."""
    mask = np.zeros((SIZE, SIZE), dtype=bool)
    for x0, y0, x1, y1 in lines:
        stamps = max(1, math.ceil(math.hypot(x1 - x0, y1 - y0) * SIZE / 3))
        for i in range(stamps + 1):
            t = i / stamps
            mask |= circle_mask((x0 + (x1 - x0) * t) * SIZE, (y0 + (y1 - y0) * t) * SIZE, r)
    return mask


def damage(x: torch.Tensor, mask: np.ndarray) -> None:
    """Zero every channel of the masked cells, in place."""
    x[..., torch.from_numpy(mask).to(x.device)] = 0


def random_damage(rng: np.random.Generator) -> np.ndarray:
    """What visitors do to it: mostly drags, sometimes a cut right between the
    letters (which leaves two halves that must each remember which letter they
    were), sometimes a round bite."""
    kind = rng.random()
    if kind < 0.25:
        cx, cy = rng.uniform(0.2, 0.8, 2) * SIZE
        return circle_mask(cx, cy, rng.uniform(0.08, 0.25) * SIZE)
    r = rng.uniform(0.08, 0.14) * SIZE
    if kind < 0.5:
        x0 = rng.uniform(0.3, 0.7)
        return stroke_mask([(x0, 0.0, x0 + rng.uniform(-0.1, 0.1), 1.0)], r)
    lines = []
    for _ in range(rng.integers(1, 4)):
        x0, y0 = rng.uniform(0.1, 0.9, 2)
        angle, length = rng.uniform(0, 2 * math.pi), rng.uniform(0.1, 1.0)
        lines.append((x0, y0, x0 + length * math.cos(angle), y0 + length * math.sin(angle)))
    return stroke_mask(lines, r)


def per_sample_loss(x: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    return ((x[:, :4] - target) ** 2).mean(dim=(1, 2, 3))


# --- evaluation (mirrors tests/nca.test.ts) --------------------------------

BITES = [("bite_centre", 0.5, 0.5), ("bite_left", 0.3, 0.5), ("bite_lower_right", 0.65, 0.7)]
STROKES = [
    ("stroke_vertical", [(0.5, 0, 0.5, 1)]),
    ("stroke_horizontal", [(0, 0.5, 1, 0.5)]),
    ("stroke_diagonal", [(0.1, 0.2, 0.9, 0.8)]),
    ("stroke_scribbles", [(0.25, 0.35, 0.35, 0.45), (0.6, 0.6, 0.7, 0.5), (0.45, 0.3, 0.5, 0.7)]),
]


@torch.no_grad()
def evaluate(model: NCA, target: torch.Tensor, device: torch.device, n: int = 16) -> dict[str, float]:
    """Mean MSE over n runs for each check in the test. (The mean, not the max:
    with a handful of runs the max is one unlucky sample and too noisy to pick
    checkpoints by.)"""
    x = model(seed_state(n, device), 300)
    out = {"grow300": per_sample_loss(x, target).mean().item()}
    for name, fx, fy in BITES:
        y = x.clone()
        damage(y, circle_mask(fx * SIZE, fy * SIZE, 0.2 * SIZE))
        out[name] = per_sample_loss(model(y, 300), target).mean().item()
    for name, lines in STROKES:
        y = x.clone()
        damage(y, stroke_mask(lines, 0.12 * SIZE))
        out[name] = per_sample_loss(model(y, 600), target).mean().item()
    out["stable1300"] = per_sample_loss(model(x, 1000), target).mean().item()
    return out


def show(scores: dict[str, float]) -> str:
    return " ".join(f"{k}={v:.4f}" for k, v in scores.items())


# --- training ---------------------------------------------------------------

def train(args: argparse.Namespace) -> None:
    device = torch.device("mps" if torch.backends.mps.is_available() and not args.cpu else "cpu")
    torch.manual_seed(args.seed)

    rng = np.random.default_rng(args.seed)

    if args.write_target:
        # Rounded once, so the loss and the shipped target.json see the same numbers.
        write_target(make_target(highlight=not args.plain).round(4), args.target)
    # Train on the file, not a fresh render: a font or Pillow update must not
    # silently move the target away from the one the tests compare against.
    target = torch.from_numpy(read_target(args.target)).permute(2, 0, 1)[None].to(device)

    model = NCA().to(device)
    if args.init:
        model.load_state_dict(load_weights(args.init, device))
    params = sum(p.numel() for p in model.parameters())
    print(f"device={device} grid={SIZE} params={params}", flush=True)

    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.MultiStepLR(opt, milestones=[round(args.iters * f) for f in args.decay], gamma=0.1)

    pool = seed_state(args.pool, device)
    best = math.inf
    if args.init:
        # A fine-tune only replaces the --out file if it beats where it started.
        scores = evaluate(model, target, device)
        best = max(scores.values())
        print(f"  init  worst {best:.4f}  {show(scores)}", flush=True)
    t0 = time.time()
    for it in range(1, args.iters + 1):
        idx = torch.from_numpy(rng.choice(args.pool, args.batch, replace=False)).to(device)
        x = pool[idx]
        with torch.no_grad():
            order = per_sample_loss(x, target).argsort(descending=True)
            x = x[order]
            idx = idx[order]
            x[:1] = seed_state(1, device)  # the worst sample restarts from seed
            for i in range(args.batch - args.damaged, args.batch):  # the best ones get damaged
                damage(x[i : i + 1], random_damage(rng))

        steps = int(rng.integers(64, 97))
        x = model(x, steps)
        loss = per_sample_loss(x, target).mean()

        opt.zero_grad()
        loss.backward()
        for p in model.parameters():  # per-parameter gradient normalisation, as in the paper
            p.grad /= p.grad.norm() + 1e-8
        opt.step()
        sched.step()
        pool[idx] = x.detach()

        if it % 100 == 0:
            print(f"it {it:5d}  loss {loss.item():.5f}  log10 {math.log10(loss.item()):.2f}  {time.time() - t0:5.0f}s", flush=True)
        if it % 1000 == 0 or it == args.iters:
            # Late training is noisy, so keep the checkpoint whose worst test-like
            # case is best rather than whatever the last iteration left.
            scores = evaluate(model, target, device)
            worst = max(scores.values())
            print(f"  eval  worst {worst:.4f}  {show(scores)}", flush=True)
            if worst < best:
                best = worst
                export(model, args.out)
                print("  saved", flush=True)

    if best == math.inf or not args.out.exists():
        print("nothing saved")
        return
    # Re-check with the rounded weights the browser will actually load.
    model.load_state_dict(load_weights(args.out, device))
    print("final (rounded weights)", show(evaluate(model, target, device, 32)))
    print(f"done in {time.time() - t0:.0f}s")


# --- export -------------------------------------------------------------------

def sig(v: float, digits: int = 5) -> float:
    return float(f"{v:.{digits}g}")


def export(model: NCA, path: pathlib.Path) -> None:
    w1 = model.w1.weight.detach().cpu().reshape(HIDDEN, 3 * CHANNELS)  # [hidden][perception]
    b1 = model.w1.bias.detach().cpu()
    w2 = model.w2.weight.detach().cpu().reshape(CHANNELS, HIDDEN)      # [channel][hidden]
    data = {
        "size": SIZE,
        "channels": CHANNELS,
        "hidden": HIDDEN,
        "fireRate": FIRE_RATE,
        "aliveThreshold": ALIVE,
        "w1": [sig(v) for v in w1.flatten().tolist()],
        "b1": [sig(v) for v in b1.tolist()],
        "w2": [sig(v) for v in w2.flatten().tolist()],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")))


def load_weights(path: pathlib.Path, device: torch.device) -> dict[str, torch.Tensor]:
    data = json.loads(path.read_text())
    t = lambda k, *shape: torch.tensor(data[k], dtype=torch.float32, device=device).reshape(*shape)
    model = NCA().to(device)
    state = model.state_dict()
    state["w1.weight"] = t("w1", HIDDEN, 3 * CHANNELS, 1, 1)
    state["w1.bias"] = t("b1", HIDDEN)
    state["w2.weight"] = t("w2", CHANNELS, HIDDEN, 1, 1)
    return state


def read_target(path: pathlib.Path) -> np.ndarray:
    data = json.loads(path.read_text())
    if data["size"] != SIZE:
        raise SystemExit(f"{path} is {data['size']}x{data['size']}, the model is {SIZE}x{SIZE}")
    return np.asarray(data["rgba"], dtype=np.float32).reshape(SIZE, SIZE, 4)


def write_target(rgba: np.ndarray, path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    flat = [round(float(v), 4) for v in rgba.reshape(-1)]  # undo float32 noise, same values
    path.write_text(json.dumps({"size": SIZE, "rgba": flat}, separators=(",", ":")))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--iters", type=int, default=12000)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--damaged", type=int, default=4, help="samples per batch that get damaged")
    ap.add_argument("--pool", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--decay", type=lambda v: [float(f) for f in v.split(",")], default=[0.4, 0.85],
                    help="fractions of the run where the learning rate drops 10x (default 0.4,0.85)")
    ap.add_argument("--init", type=pathlib.Path, help="start from these weights (a gr.json) instead of scratch")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--plain", action="store_true", help="black GR without the lime block behind R")
    ap.add_argument("--cpu", action="store_true")
    ap.add_argument("--out", type=pathlib.Path, default=ROOT / "public/nca/gr.json")
    ap.add_argument("--target", type=pathlib.Path, default=ROOT / "scripts/nca/target.json")
    ap.add_argument("--write-target", action="store_true", help="render GR again and overwrite --target before training")
    train(ap.parse_args())
