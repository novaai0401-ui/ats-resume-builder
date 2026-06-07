"""Smoke tests for label_alignment — pure Python, no torch / HF needed.

Run with:  python -m unittest training.tests.test_label_alignment -v
"""
from __future__ import annotations

import unittest

from training.label_alignment import (
    BIO_LABELS,
    align_labels_to_tokens,
    spans_from_labels,
)


class SpansFromLabelsTest(unittest.TestCase):
    def test_finds_basic_spans(self):
        text = "Jane Doe — Senior Engineer at Acme Corp. jane@x.io"
        labels = {
            "contact": {"fullName": "Jane Doe", "email": "jane@x.io"},
            "experience": [{"role": "Senior Engineer", "company": "Acme Corp"}],
        }
        spans = spans_from_labels(text, labels)
        ents = {ent for _, _, ent in spans}
        self.assertEqual(ents, {"FULLNAME", "EMAIL", "ROLE", "COMPANY"})

    def test_drops_values_not_in_text(self):
        text = "Plain text only"
        labels = {"contact": {"email": "missing@example.com"}}
        self.assertEqual(spans_from_labels(text, labels), [])

    def test_longer_span_wins_on_overlap(self):
        text = "Jane Doe led the team"
        labels = {
            "contact": {"fullName": "Jane Doe"},
            # "Jane" alone would overlap with "Jane Doe" — longer wins.
            "skills": ["Jane"],
        }
        spans = spans_from_labels(text, labels)
        # Only FULLNAME survives; SKILL gets dropped due to overlap.
        ents = [ent for _, _, ent in spans]
        self.assertIn("FULLNAME", ents)
        self.assertNotIn("SKILL", ents)

    def test_skips_too_short_values(self):
        text = "A B C D"
        labels = {"skills": ["A"]}
        self.assertEqual(spans_from_labels(text, labels), [])


class AlignToTokensTest(unittest.TestCase):
    def test_special_tokens_get_minus_100(self):
        # Two special tokens (CLS/SEP) at the edges, three real tokens in middle.
        offsets = [(0, 0), (0, 4), (5, 8), (9, 12), (0, 0)]
        spans = [(0, 4, "FULLNAME")]
        tags = align_labels_to_tokens(offsets, spans)
        self.assertEqual(tags[0], -100)
        self.assertEqual(tags[-1], -100)
        self.assertEqual(BIO_LABELS[tags[1]], "B-FULLNAME")
        self.assertEqual(BIO_LABELS[tags[2]], "O")

    def test_multi_token_span_gets_B_then_I(self):
        offsets = [(0, 4), (5, 8), (9, 12)]
        spans = [(0, 12, "ROLE")]
        tags = align_labels_to_tokens(offsets, spans)
        self.assertEqual(BIO_LABELS[tags[0]], "B-ROLE")
        self.assertEqual(BIO_LABELS[tags[1]], "I-ROLE")
        self.assertEqual(BIO_LABELS[tags[2]], "I-ROLE")


class BioLabelSetTest(unittest.TestCase):
    def test_includes_O_and_balanced_BI(self):
        self.assertEqual(BIO_LABELS[0], "O")
        # Every non-O label must come in a matched B-/I- pair.
        non_o = BIO_LABELS[1:]
        prefixes = {lbl.split("-", 1)[0] for lbl in non_o}
        self.assertEqual(prefixes, {"B", "I"})
        ents_b = {lbl.split("-", 1)[1] for lbl in non_o if lbl.startswith("B-")}
        ents_i = {lbl.split("-", 1)[1] for lbl in non_o if lbl.startswith("I-")}
        self.assertEqual(ents_b, ents_i)


if __name__ == "__main__":
    unittest.main()
