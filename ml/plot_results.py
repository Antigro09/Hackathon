"""Readable, source-backed notebook plots for the held-out experiment only."""

from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt


def plot_results(result: dict, output_dir: str | Path):
    probe = result["probe"]["splits"]["test"]["ungated"]
    baseline = result["zeroShotMatchedLabels"]["splits"]["test"]["ungated"]
    classes = probe["classOrder"]
    labels = [label.replace("_", " ") for label in classes]
    assert baseline["classOrder"] == classes
    matrix = np.asarray(probe["confusionMatrix"], dtype=int)
    figure, axes = plt.subplots(1, 2, figsize=(13, 5.2), layout="constrained")
    image = axes[0].imshow(matrix, cmap="Blues", vmin=0)
    axes[0].set_xticks(range(len(labels)), labels, rotation=40, ha="right")
    axes[0].set_yticks(range(len(labels)), labels)
    axes[0].set_xlabel("Predicted sound type")
    axes[0].set_ylabel("Source label")
    axes[0].set_title(f"Linear classifier: held-out clips (n={probe['sampleCount']})")
    for row in range(len(classes)):
        for column in range(len(classes)):
            axes[0].text(column, row, str(matrix[row, column]), ha="center", va="center",
                         color="white" if matrix[row, column] > matrix.max() / 2 else "#1f2937")
    figure.colorbar(image, ax=axes[0], label="Number of clips", shrink=0.75)
    positions = np.arange(len(classes))
    probe_f1 = [item["f1"] for item in probe["perClass"]]
    baseline_f1 = [item["f1"] for item in baseline["perClass"]]
    axes[1].barh(positions - 0.18, baseline_f1, height=0.34, color="#c7ccd2", edgecolor="#4b5563", label="Matched zero-shot baseline")
    axes[1].barh(positions + 0.18, probe_f1, height=0.34, color="#466b86", label="Trained linear classifier")
    axes[1].set_yticks(positions, labels)
    axes[1].invert_yaxis()
    axes[1].set_xlim(0, 1)
    axes[1].set_xlabel("F1 score (before unknown-sound rejection)")
    axes[1].set_title("Per-class performance on the same held-out clips")
    axes[1].legend(loc="lower right", frameon=False)
    axes[1].grid(axis="x", alpha=0.15)
    axes[1].set_axisbelow(True)
    for axis in axes:
        axis.spines[["top", "right"]].set_visible(False)
    figure.suptitle("Public-audio benchmark • broad sound tags, not verified equipment identity", fontsize=13)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    figure.savefig(output_dir / "held-out-comparison.png", dpi=160, bbox_inches="tight")
    return figure
