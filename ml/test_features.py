"""Offline checks; model downloads/inference and browser parity are separate QA."""

import unittest
from unittest.mock import Mock, patch

import numpy as np

from ml.features import (
    OBSERVATION_SAMPLES, PROCESSOR_SAMPLES, compare_browser_golden,
    embed_audio, embed_texts, normalize_embeddings, pad_browser5s, preprocess5s,
    zero_shot_scores,
)


class FrozenFeaturesTests(unittest.TestCase):
    def test_exact_browser_padding_preserves_pcm_and_does_not_repeat(self):
        audio = np.linspace(-0.9, 0.9, OBSERVATION_SAMPLES, dtype=np.float32)
        before = audio.copy()
        padded = pad_browser5s(audio)
        self.assertEqual(padded.shape, (PROCESSOR_SAMPLES,))
        np.testing.assert_array_equal(padded[:OBSERVATION_SAMPLES], audio)
        np.testing.assert_array_equal(padded[OBSERVATION_SAMPLES:], 0)
        np.testing.assert_array_equal(audio, before)

    def test_rejects_wrong_duration_stereo_and_nonfinite_pcm(self):
        for value in [np.zeros(10), np.zeros((OBSERVATION_SAMPLES, 1)), np.full(OBSERVATION_SAMPLES, np.nan)]:
            with self.assertRaises(ValueError):
                pad_browser5s(value)

    def test_silence_has_fixed_shape_and_finite_floor(self):
        actual = preprocess5s(np.zeros(OBSERVATION_SAMPLES, dtype=np.float32))
        self.assertEqual(actual.shape, (1, 1, 1001, 64))
        self.assertEqual(actual.dtype, np.float32)
        np.testing.assert_allclose(actual, -100.0, atol=1e-5)

    def test_golden_comparison_is_explicit_and_reports_differences(self):
        audio = np.zeros(OBSERVATION_SAMPLES, dtype=np.float32)
        # Analytic silence is an offline golden. Non-silent browser tensors are
        # separately exported from the pinned JS processor for promotion QA.
        golden = np.full((1, 1, 1001, 64), -100, dtype=np.float32)
        report = compare_browser_golden(audio, golden)
        self.assertLessEqual(report["max_abs_error"], 1e-5)
        golden[0, 0, 0, 0] += 1
        self.assertGreater(compare_browser_golden(audio, golden)["max_abs_error"], 0.9)

    def test_embed_audio_uses_exact_input_and_normalizes_without_model_download(self):
        session = Mock()
        session.get_inputs.return_value = [Mock(name="unused")]
        session.get_inputs.return_value[0].name = "input_features"
        session.get_outputs.return_value = [Mock(name="unused")]
        session.get_outputs.return_value[0].name = "audio_embeds"
        embedding = np.arange(1, 513, dtype=np.float32)[None, :]
        session.run.return_value = [embedding]
        actual = embed_audio(session, np.zeros((1, 1, 1001, 64), dtype=np.float32))
        self.assertEqual(actual.shape, (1, 512))
        np.testing.assert_allclose(np.linalg.norm(actual, axis=1), 1, atol=1e-6)
        self.assertEqual(session.run.call_args.args[0], ["audio_embeds"])

    def test_zero_embeddings_and_invalid_scale_fail(self):
        with self.assertRaises(ValueError):
            normalize_embeddings(np.zeros((1, 512)))
        with self.assertRaises(ValueError):
            zero_shot_scores(np.ones((1, 512)), np.ones((2, 512)), logit_scale=0)

    def test_text_graph_without_attention_mask_gets_only_exported_inputs(self):
        session = Mock()
        item = Mock()
        item.name = "input_ids"
        session.get_inputs.return_value = [item]
        session.run.return_value = [np.ones((1, 512), dtype=np.float32)]
        tokens = {"input_ids": np.asarray([[0, 42, 2]]), "attention_mask": np.asarray([[1, 1, 1]])}
        with patch("ml.features.tokenize_texts", return_value=tokens):
            actual = embed_texts(session, ["wind"], "unused-cache")
        self.assertEqual(actual.shape, (1, 512))
        self.assertEqual(set(session.run.call_args.args[1]), {"input_ids"})

    def test_cosine_scores_follow_supplied_label_order(self):
        vectors = np.eye(512, dtype=np.float32)[:2]
        scores = zero_shot_scores(vectors, vectors[::-1], logit_scale=10)
        np.testing.assert_array_equal(scores.argmax(axis=1), [1, 0])
        np.testing.assert_allclose(scores.sum(axis=1), 1)


if __name__ == "__main__":
    unittest.main()
