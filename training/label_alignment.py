"""Convert structured labels into BIO-tagged token spans.

The trick: labels are nested JSON (e.g. `labels.experience[2].role`),
but the model trains on the flat text. We locate each label's value
as a substring in the source text and emit a (start, end, tag) span.

Values that don't appear verbatim are silently dropped — they're
either rephrased (no positional signal to teach) or hallucinated
(should never have been labeled). Counting drops lets us flag noisy
sources later.
"""
from __future__ import annotations

from typing import Iterable, Optional

# BIO tag set. Kept small in v1; expand alongside the parser's
# downstream consumer when the model proves useful.
ENTITY_TYPES = (
    "FULLNAME",
    "EMAIL",
    "PHONE",
    "LOCATION",
    "SUMMARY",
    "SKILL",
    "ROLE",
    "COMPANY",
    "DATE",
    "HIGHLIGHT",
    "INSTITUTION",
    "DEGREE",
    "PROJECT",
    "CERT",
)

BIO_LABELS: tuple[str, ...] = ("O",) + tuple(
    f"{prefix}-{ent}" for ent in ENTITY_TYPES for prefix in ("B", "I")
)


def _find_span(text: str, value: str) -> Optional[tuple[int, int]]:
    if not value:
        return None
    needle = value.strip()
    if len(needle) < 2:
        return None
    idx = text.find(needle)
    if idx < 0:
        return None
    return (idx, idx + len(needle))


def spans_from_labels(text: str, labels: dict) -> list[tuple[int, int, str]]:
    """Return a list of (start, end, ENTITY) spans found in the text.

    Spans are deduped and sorted; on overlap, the longer span wins
    (longer = more informative, e.g. "Jane Doe" beats "Jane").
    """
    candidates: list[tuple[int, int, str]] = []

    def add(value: Optional[str], ent: str) -> None:
        if not isinstance(value, str):
            return
        span = _find_span(text, value)
        if span is not None:
            candidates.append((span[0], span[1], ent))

    contact = labels.get("contact") or {}
    add(contact.get("fullName"), "FULLNAME")
    add(contact.get("email"), "EMAIL")
    add(contact.get("phone"), "PHONE")
    add(contact.get("location"), "LOCATION")

    add(labels.get("summary"), "SUMMARY")

    for skill in labels.get("skills") or []:
        add(skill, "SKILL")

    for exp in labels.get("experience") or []:
        add(exp.get("role"), "ROLE")
        add(exp.get("company"), "COMPANY")
        add(exp.get("startDate"), "DATE")
        add(exp.get("endDate"), "DATE")
        for h in exp.get("highlights") or []:
            add(h, "HIGHLIGHT")

    for edu in labels.get("education") or []:
        add(edu.get("institution"), "INSTITUTION")
        add(edu.get("degree"), "DEGREE")
        add(edu.get("startDate"), "DATE")
        add(edu.get("endDate"), "DATE")

    for proj in labels.get("projects") or []:
        add(proj.get("name"), "PROJECT")

    for cert in labels.get("certifications") or []:
        add(cert.get("name"), "CERT")

    # Longer-first; then start-position-first. _select_non_overlapping
    # iterates in that order and accepts a span only when it doesn't
    # touch any already-accepted region.
    candidates.sort(key=lambda s: (-(s[1] - s[0]), s[0]))
    return _select_non_overlapping(candidates)


def _select_non_overlapping(spans: Iterable[tuple[int, int, str]]) -> list[tuple[int, int, str]]:
    accepted: list[tuple[int, int, str]] = []
    for s, e, ent in spans:
        if any(not (e <= a_s or s >= a_e) for a_s, a_e, _ in accepted):
            continue
        accepted.append((s, e, ent))
    accepted.sort(key=lambda x: x[0])
    return accepted


def align_labels_to_tokens(
    offsets: list[tuple[int, int]],
    spans: list[tuple[int, int, str]],
) -> list[int]:
    """Project character-level spans onto subword tokens using offsets.

    Special tokens (CLS / SEP / pad) have offset (0, 0). Hugging Face
    convention is to label those with -100 so the loss ignores them.
    """
    label2id = {lbl: i for i, lbl in enumerate(BIO_LABELS)}
    out: list[int] = []
    for tok_start, tok_end in offsets:
        if tok_start == 0 and tok_end == 0:
            out.append(-100)
            continue
        tag_id = label2id["O"]
        for s, e, ent in spans:
            if tok_start >= s and tok_end <= e:
                prefix = "B" if tok_start == s else "I"
                tag_id = label2id[f"{prefix}-{ent}"]
                break
        out.append(tag_id)
    return out
