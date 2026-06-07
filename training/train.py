"""Fine-tune a small encoder model on the prepared resume corpus.

Phase-8 v1 is intentionally NOT LayoutLMv3 — we start with a plain
text encoder (DistilBERT or similar) framed as a token-classification
task. Layout-aware models come later once we have layout-hint data
flowing from the API. Starting text-only means:
  * trains in <1hr on a Colab T4 with a few hundred samples,
  * runs end-to-end on CPU for a smoke test (small slice, 1 epoch),
  * proves the harness before we invest in heavier architectures.

Labeling strategy: BIO tagging on the resume text. For every labeled
span (e.g. contact.fullName = "Jane Doe"), find the substring in the
source text and tag those tokens with B-FULLNAME / I-FULLNAME.
Substrings that don't appear verbatim are skipped — they teach the
model nothing useful and inflate noise.

Usage:
    python -m training.train \\
        --data ./data/v1 \\
        --output ./runs/v1 \\
        --base-model distilbert-base-uncased \\
        --epochs 3 \\
        --batch-size 8

Use --smoke to run a 16-sample, 1-epoch sanity check on CPU.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Iterable

from datasets import load_from_disk

from training.label_alignment import (
    BIO_LABELS,
    align_labels_to_tokens,
    spans_from_labels,
)


def build_examples(row: dict, tokenizer) -> dict:
    labels_obj = json.loads(row["labels_json"]) if row.get("labels_json") else None
    text: str = row["text"]
    enc = tokenizer(
        text,
        truncation=True,
        max_length=512,
        return_offsets_mapping=True,
    )
    spans = spans_from_labels(text, labels_obj) if labels_obj else []
    tags = align_labels_to_tokens(enc["offset_mapping"], spans)
    enc["labels"] = tags
    enc.pop("offset_mapping")
    return enc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--base-model", default="distilbert-base-uncased")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--learning-rate", type=float, default=5e-5)
    ap.add_argument("--smoke", action="store_true", help="16 samples / 1 epoch / CPU OK")
    args = ap.parse_args()

    # Import lazily so the CLI loads fast and the rest of the repo can run
    # tests without torch installed.
    from transformers import (
        AutoModelForTokenClassification,
        AutoTokenizer,
        DataCollatorForTokenClassification,
        Trainer,
        TrainingArguments,
    )

    label2id = {lbl: i for i, lbl in enumerate(BIO_LABELS)}
    id2label = {i: lbl for lbl, i in label2id.items()}

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, use_fast=True)
    model = AutoModelForTokenClassification.from_pretrained(
        args.base_model,
        num_labels=len(BIO_LABELS),
        id2label=id2label,
        label2id=label2id,
    )

    train_ds = load_from_disk(str(args.data / "train"))
    val_ds = load_from_disk(str(args.data / "val")) if (args.data / "val").exists() else None
    if args.smoke:
        train_ds = train_ds.select(range(min(16, len(train_ds))))
        if val_ds is not None:
            val_ds = val_ds.select(range(min(4, len(val_ds))))

    train_ds = train_ds.map(lambda r: build_examples(r, tokenizer), remove_columns=train_ds.column_names)
    if val_ds is not None:
        val_ds = val_ds.map(lambda r: build_examples(r, tokenizer), remove_columns=val_ds.column_names)

    collator = DataCollatorForTokenClassification(tokenizer=tokenizer)

    args.output.mkdir(parents=True, exist_ok=True)
    targs = TrainingArguments(
        output_dir=str(args.output),
        num_train_epochs=1 if args.smoke else args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        eval_strategy="epoch" if val_ds is not None else "no",
        save_strategy="epoch",
        save_total_limit=2,
        logging_steps=10,
        report_to=[],
        # CPU fallback for smoke mode — no fp16 etc.
        fp16=not args.smoke and bool(int(os.environ.get("USE_FP16", "1"))),
    )

    trainer = Trainer(
        model=model,
        args=targs,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        data_collator=collator,
    )
    trainer.train()
    trainer.save_model(str(args.output / "final"))
    tokenizer.save_pretrained(str(args.output / "final"))
    print(f"Done. Model saved to {args.output / 'final'}")


if __name__ == "__main__":
    main()
