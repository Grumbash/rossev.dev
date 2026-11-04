"""Export Silero VAD weights for the voice demo, and the test fixture that pins them.

Silero VAD (https://github.com/snakers4/silero-vad, MIT) v6.2.3, file
src/silero_vad/data/silero_vad_16k_op15.onnx (1,289,603 B). The browser runs the
model in src/scripts/vad/model.ts, a TypeScript port of this graph:

  input 576 samples at 16 kHz (64 samples of context from the previous chunk + 512 new)
  -> reflect-pad 64 on the right -> STFT as a conv (256-sample periodic Hann, hop 128)
  -> magnitude of 129 bins x 4 frames
  -> conv1d 129->128 (k3, s1) ReLU -> 128->64 (k3, s2) ReLU -> 64->64 (k3, s2) ReLU
  -> 64->128 (k3, s1) ReLU -> LSTM cell 128 -> ReLU -> conv1d 128->1 -> sigmoid

The STFT basis is plain periodic Hann x DFT (checked against the ONNX buffer to 1e-7),
so the page computes it instead of downloading it.

Files:
  public/vad/silero-vad-v6.2.3.bin  float16 weights, no header, in WEIGHT_ORDER below
                                    (decoded by src/scripts/vad/model.ts; 487,170 B).
  tests/fixtures/vad/hello.wav      1 s of quiet room noise, then a synthetic "Hello, is this
                                    the clinic?" (macOS `say`), 16 kHz mono int16.
  tests/fixtures/vad/hello.json     the ONNX model's speech probability for every 512-sample
                                    chunk of hello.wav, float32 weights, onnxruntime on CPU.

Usage (needs numpy, onnx, onnxruntime):
  python scripts/vad/export.py silero_vad_16k_op15.onnx [speech.wav]
speech.wav defaults to the existing fixture's speech; pass one to regenerate it.
"""

import hashlib
import json
import sys
import wave

import numpy as np
import onnx
import onnxruntime as ort
from onnx import numpy_helper

SOURCE_SHA256 = '7ed98ddbad84ccac4cd0aeb3099049280713df825c610a8ed34543318f1b2c49'
WEIGHT_ORDER = [
    'model.encoder.0.reparam_conv.weight', 'model.encoder.0.reparam_conv.bias',
    'model.encoder.1.reparam_conv.weight', 'model.encoder.1.reparam_conv.bias',
    'model.encoder.2.reparam_conv.weight', 'model.encoder.2.reparam_conv.bias',
    'model.encoder.3.reparam_conv.weight', 'model.encoder.3.reparam_conv.bias',
    'model.decoder.rnn.weight_ih', 'model.decoder.rnn.weight_hh',
    'model.decoder.rnn.bias_ih', 'model.decoder.rnn.bias_hh',
    'model.decoder.decoder.2.weight', 'model.decoder.decoder.2.bias',
]
OUT_BIN = 'public/vad/silero-vad-v6.2.3.bin'
FIXTURE_WAV = 'tests/fixtures/vad/hello.wav'
FIXTURE_JSON = 'tests/fixtures/vad/hello.json'
RATE = 16000
CHUNK = 512
CONTEXT = 64


def initializers(graph, out):
    for t in graph.initializer:
        out[t.name] = numpy_helper.to_array(t)
    for node in graph.node:
        for a in node.attribute:
            if a.type == onnx.AttributeProto.GRAPH:
                initializers(a.g, out)
    return out


def read_wav(path):
    with wave.open(path) as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def main():
    model_path = sys.argv[1]
    blob = open(model_path, 'rb').read()
    digest = hashlib.sha256(blob).hexdigest()
    if digest != SOURCE_SHA256:
        sys.exit(f'{model_path}: sha256 {digest}, expected silero_vad_16k_op15.onnx v6.2.3')

    weights = initializers(onnx.load(model_path).graph, {})
    with open(OUT_BIN, 'wb') as f:
        for name in WEIGHT_ORDER:
            f.write(weights[name].astype('<f2').tobytes())

    if len(sys.argv) > 2:
        speech = read_wav(sys.argv[2])
        # Deterministic room noise (about -54 dBFS) so the onset has a floor to rise from.
        noise = (np.random.RandomState(0).randn(RATE) * 0.002 * 32768).astype(np.int16)
        pcm = np.concatenate([noise, speech])
        with wave.open(FIXTURE_WAV, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
    pcm = read_wav(FIXTURE_WAV)

    audio = pcm.astype(np.float32) / 32768
    session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
    state = np.zeros((2, 1, 128), np.float32)
    context = np.zeros(CONTEXT, np.float32)
    probs = []
    for k in range(len(audio) // CHUNK):
        chunk = audio[k * CHUNK:(k + 1) * CHUNK]
        out, state = session.run(None, {
            'input': np.concatenate([context, chunk])[None],
            'state': state,
            'sr': np.array(RATE, np.int64),
        })
        probs.append(round(float(out[0, 0]), 6))
        context = chunk[-CONTEXT:]
    with open(FIXTURE_JSON, 'w') as f:
        json.dump({'model': 'silero_vad_16k_op15.onnx v6.2.3', 'chunk': CHUNK, 'probs': probs}, f)
        f.write('\n')


if __name__ == '__main__':
    main()
