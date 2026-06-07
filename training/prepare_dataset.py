"""Load a JSONL export from the API, validate it against the schema,
and emit train/val/test splits as Hugging Face `datasets` arrow shards.

Usage:
    python -m training.prepare_dataset \\
        --input ./exports/training.jsonl \\
        --output ./data/v1

The output directory contains three subdirectories — train/, val/, test/ —
each a self-contained `datasets` save directory loadable with
`load_from_disk`. We do NOT re-split here: the `split` field already on
each row is the source of truth (assigned by the API, deterministic,
stratified by source format).
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from datasets import Dataset

from training.schema import Sample


def load_jsonl(path: Path) -> list[Sample]:
    samples: list[Sample] = []
    with path.open("r", encoding="utf-8") as f:
        for ln, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                samples.append(Sample.model_validate(obj))
            except Exception as e:
                print(f"[warn] line {ln} dropped: {e}")
    return samples


def to_hf_row(s: Sample) -> dict:
    return {
        "id": s.id,
        "text": s.text,
        "source_format": s.source_format,
        "labels_json": s.labels.model_dump_json() if s.labels else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    args = ap.parse_args()

    samples = load_jsonl(args.input)
    if not samples:
        raise SystemExit("No valid samples loaded — check the input file.")

    split_counts: Counter[str] = Counter(s.split for s in samples)
    format_counts: Counter[str] = Counter(s.source_format for s in samples)
    labeled = sum(1 for s in samples if s.labels is not None)

    print(f"Loaded {len(samples)} samples ({labeled} labeled).")
    print(f"  Splits : {dict(split_counts)}")
    print(f"  Formats: {dict(format_counts)}")

    args.output.mkdir(parents=True, exist_ok=True)
    for split in ("train", "val", "test"):
        rows = [to_hf_row(s) for s in samples if s.split == split and s.labels is not None]
        if not rows:
            print(f"[warn] split '{split}' has 0 labeled rows — skipping")
            continue
        ds = Dataset.from_list(rows)
        out = args.output / split
        ds.save_to_disk(str(out))
        print(f"  wrote {len(ds)} rows -> {out}")


if __name__ == "__main__":
    main()
