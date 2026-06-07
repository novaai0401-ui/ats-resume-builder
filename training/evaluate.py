"""Evaluate a fine-tuned token-classification checkpoint and optionally
POST the per-field metrics to /admin/training-dataset/evaluations so
the ModelEvaluation table grows alongside model runs.

Usage:
    python -m training.evaluate \\
        --model ./runs/v1/final \\
        --data ./data/v1 \\
        --split test \\
        --model-name layoutlmv3-resume \\
        --model-version 2026.05.30-r1
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from pathlib import Path

from datasets import load_from_disk

from training.label_alignment import (
    BIO_LABELS,
    align_labels_to_tokens,
    spans_from_labels,
)


def _spans_from_tags(tokens: list[str], tags: list[str]) -> set[tuple[str, int, int]]:
    """Walk BIO tags and emit (entity, start_idx, end_idx) for each span."""
    out: set[tuple[str, int, int]] = set()
    cur_ent: str | None = None
    cur_start: int | None = None
    for i, tag in enumerate(tags):
        if tag == "O" or tag.startswith("B-"):
            if cur_ent is not None and cur_start is not None:
                out.add((cur_ent, cur_start, i))
                cur_ent, cur_start = None, None
        if tag.startswith("B-"):
            cur_ent = tag.split("-", 1)[1]
            cur_start = i
        elif tag.startswith("I-") and cur_ent is None:
            # I- without B- is malformed but lenient: treat as B-.
            cur_ent = tag.split("-", 1)[1]
            cur_start = i
    if cur_ent is not None and cur_start is not None:
        out.add((cur_ent, cur_start, len(tags)))
    return out


def _prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * p * r / (p + r) if (p + r) else 0.0
    return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(f1, 4), "support": tp + fn}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, type=Path)
    ap.add_argument("--data", required=True, type=Path)
    ap.add_argument("--split", default="test")
    ap.add_argument("--model-name", required=True)
    ap.add_argument("--model-version", required=True)
    ap.add_argument("--upload-url", default=os.environ.get("UPLOAD_URL"))
    ap.add_argument("--upload-token", default=os.environ.get("UPLOAD_TOKEN"))
    args = ap.parse_args()

    from transformers import AutoModelForTokenClassification, AutoTokenizer
    import torch

    tokenizer = AutoTokenizer.from_pretrained(str(args.model), use_fast=True)
    model = AutoModelForTokenClassification.from_pretrained(str(args.model))
    model.eval()
    id2label = {i: lbl for i, lbl in enumerate(BIO_LABELS)}

    ds = load_from_disk(str(args.data / args.split))

    per_ent_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})

    for row in ds:
        text = row["text"]
        gold_labels = json.loads(row["labels_json"]) if row.get("labels_json") else None
        if gold_labels is None:
            continue
        enc = tokenizer(text, truncation=True, max_length=512, return_offsets_mapping=True, return_tensors="pt")
        offsets = enc.pop("offset_mapping")[0].tolist()
        with torch.no_grad():
            logits = model(**{k: v for k, v in enc.items()}).logits[0]
        pred_ids = logits.argmax(dim=-1).tolist()
        pred_tags = [id2label[i] for i in pred_ids]
        gold_spans_char = spans_from_labels(text, gold_labels)
        gold_token_ids = align_labels_to_tokens(offsets, gold_spans_char)
        gold_tags = ["O" if t in (-100, 0) else id2label[t] for t in gold_token_ids]

        pred_spans = _spans_from_tags([], pred_tags)
        gold_spans = _spans_from_tags([], gold_tags)

        for ent, _, _ in pred_spans & gold_spans:
            per_ent_counts[ent]["tp"] += 1
        for ent, _, _ in pred_spans - gold_spans:
            per_ent_counts[ent]["fp"] += 1
        for ent, _, _ in gold_spans - pred_spans:
            per_ent_counts[ent]["fn"] += 1

    metrics = {ent: _prf(c["tp"], c["fp"], c["fn"]) for ent, c in per_ent_counts.items()}
    overall_tp = sum(c["tp"] for c in per_ent_counts.values())
    overall_fp = sum(c["fp"] for c in per_ent_counts.values())
    overall_fn = sum(c["fn"] for c in per_ent_counts.values())
    metrics["__overall__"] = _prf(overall_tp, overall_fp, overall_fn)

    payload = {
        "modelName": args.model_name,
        "modelVersion": args.model_version,
        "sampleCount": len(ds),
        "metrics": metrics,
    }
    print(json.dumps(payload, indent=2))

    if args.upload_url and args.upload_token:
        import requests

        r = requests.post(
            args.upload_url.rstrip("/") + "/admin/training-dataset/evaluations",
            json=payload,
            headers={"Authorization": f"Bearer {args.upload_token}"},
            timeout=30,
        )
        r.raise_for_status()
        print(f"Uploaded: {r.status_code}")


if __name__ == "__main__":
    main()
