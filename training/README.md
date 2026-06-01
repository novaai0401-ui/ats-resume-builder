# `training/` — resume parser fine-tuning harness

Pure-Python pipeline that turns the JSONL export from
`/admin/training-dataset/export.jsonl` into a fine-tuned token-
classification model and posts the eval metrics back to the API.

**No paid GPU required to start.** Phase-8 v1 is a small text encoder
(DistilBERT) — trains on Google Colab's free T4 in under an hour, runs
end-to-end on CPU in `--smoke` mode.

## Cost ladder

| Stage | Where | Cost |
| --- | --- | --- |
| 0–500 labeled samples | Colab free tier | **$0** |
| 500–5k samples, multiple experiments | Colab Pro / Kaggle | **$10/mo** |
| 5k+ samples, production runs | Modal / RunPod on-demand | **$1–3k one-time** |
| Inference | CPU on Render initially | **$0 extra** |

## End-to-end commands

```bash
# 1. Export the corpus from the API (admin auth required).
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.pocketresume.app/admin/training-dataset/export.jsonl \
     -o ./exports/training.jsonl

# 2. Validate + materialize arrow shards.
python -m training.prepare_dataset \
    --input ./exports/training.jsonl \
    --output ./data/v1

# 3. Fine-tune (smoke = 16 samples, 1 epoch, CPU OK).
python -m training.train \
    --data ./data/v1 \
    --output ./runs/v1 \
    --smoke

# Real run (Colab T4, ~30-60 min on a few hundred samples):
python -m training.train \
    --data ./data/v1 \
    --output ./runs/v1 \
    --base-model distilbert-base-uncased \
    --epochs 3 \
    --batch-size 16

# 4. Evaluate and upload metrics to the API.
export UPLOAD_URL=https://api.pocketresume.app
export UPLOAD_TOKEN=$ADMIN_TOKEN
python -m training.evaluate \
    --model ./runs/v1/final \
    --data ./data/v1 \
    --split test \
    --model-name resume-parser \
    --model-version 2026.05.30-r1
```

## Architecture choices and why

| Choice | Why |
| --- | --- |
| Token classification (BIO tags) | Direct framing of "find these fields in the text" |
| DistilBERT base in v1 | Trains on Colab free tier; small enough for CPU inference later |
| Substring alignment | Labels that don't appear verbatim are dropped (no false signal) |
| Longer-span-wins on overlap | "Jane Doe" beats "Jane" — keeps spans informative |
| Deterministic split (from the API) | Re-exports never reshuffle train/val/test |

## Files

| Path | Purpose |
| --- | --- |
| `requirements.txt` | Pinned Colab-friendly deps |
| `schema.py` | Pydantic models matching `jsonl-export.ts` |
| `prepare_dataset.py` | JSONL → validated Hugging Face arrow shards |
| `label_alignment.py` | BIO span extraction + token offset alignment |
| `train.py` | Fine-tune loop using Hugging Face Trainer |
| `evaluate.py` | Per-field P/R/F1 + POST to `/admin/training-dataset/evaluations` |
| `tests/test_label_alignment.py` | Pure-Python unit tests (no torch needed) |

## Tests

```bash
$ python -m unittest training.tests.test_label_alignment -v
Ran 7 tests in 0.001s
OK
```

## When to upgrade to LayoutLMv3

The text-only baseline will plateau on multi-column resumes and PDFs
where layout matters more than reading order. Move to LayoutLMv3 when:

- text-only F1 plateaus below 0.85 on the test set, OR
- the API starts shipping `layout_hints` (bounding boxes from
  `pdf-parse` with positional metadata), OR
- you hit 5k+ samples and have a real GPU budget.

The harness is designed so swapping `--base-model distilbert-base-uncased`
for `microsoft/layoutlmv3-base` is the only structural change — the
data pipeline and eval harness stay the same.
