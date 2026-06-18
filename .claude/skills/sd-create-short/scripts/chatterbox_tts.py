# /// script
# requires-python = ">=3.11,<3.12"
# dependencies = ["chatterbox-tts"]
# ///
"""
chatterbox_tts.py — voice-cloning TTS backend for sd-create-short.

Invoked by tts.mjs when --engine chatterbox (or --voice-ref) is passed. Kept as a
standalone uv-run script so the heavy torch/chatterbox deps stay out of the Node
toolchain — exactly like the whisper-ctranslate2 alignment step.

Chatterbox (Resemble AI) is MIT-licensed, so it is safe to ship inside the
commercial SD platform. It does zero-shot voice cloning from a short reference
clip (~5-10s of clean speech) passed via --ref. With no --ref it falls back to
its built-in default speaker.

Usage (driven by tts.mjs, not run by hand):
  uv run chatterbox_tts.py --text script.txt --out narration.wav \
    [--ref reference.wav] [--exaggeration 0.5] [--cfg-weight 0.5]

Outputs: writes a 24 kHz mono WAV to --out. Prints status to stderr only;
stdout is reserved so the caller can keep it clean.

First run downloads the Chatterbox model weights from HuggingFace (~1 GB).
"""

import argparse
import sys


def log(msg: str) -> None:
    print(f"[chatterbox] {msg}", file=sys.stderr, flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True, help="path to narration text file")
    parser.add_argument("--out", required=True, help="output WAV path")
    parser.add_argument("--ref", default=None, help="reference audio for voice cloning")
    parser.add_argument("--exaggeration", type=float, default=0.5,
                        help="emotion/intensity (0.25 calm .. 1.0 dramatic; 0.5 neutral)")
    parser.add_argument("--cfg-weight", type=float, default=0.5,
                        help="pacing/adherence (lower = slower, more deliberate)")
    args = parser.parse_args()

    try:
        with open(args.text, "r", encoding="utf-8") as fh:
            text = fh.read().strip()
    except OSError as exc:
        log(f"could not read text file: {exc}")
        return 1
    if not text:
        log("script text file is empty")
        return 1

    try:
        import torch
        from chatterbox.tts import ChatterboxTTS
    except ImportError as exc:
        log(f"import failed: {exc}")
        log("ensure 'uv' is installed; deps resolve automatically on first run.")
        return 1

    if torch.cuda.is_available():
        device = "cuda"
    elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    log(f"device={device} (first run downloads model weights from HuggingFace ~1GB)")

    try:
        model = ChatterboxTTS.from_pretrained(device=device)
    except Exception as exc:  # noqa: BLE001 — surface any init failure to the Node caller
        log(f"model load failed: {exc}")
        return 1

    gen_kwargs = {"exaggeration": args.exaggeration, "cfg_weight": args.cfg_weight}
    if args.ref:
        gen_kwargs["audio_prompt_path"] = args.ref
        log(f"cloning voice from reference: {args.ref}")
    else:
        log("no --ref given; using Chatterbox built-in default speaker")

    try:
        wav = model.generate(text, **gen_kwargs)
    except Exception as exc:  # noqa: BLE001
        log(f"generation failed: {exc}")
        return 1

    try:
        import torchaudio as ta
        ta.save(args.out, wav, model.sr)
    except Exception as exc:  # noqa: BLE001
        log(f"could not save WAV: {exc}")
        return 1

    log(f"saved {args.out} @ {model.sr} Hz")
    return 0


if __name__ == "__main__":
    sys.exit(main())
