"""High-resolution figures for the revised manuscript.

Two figures, each earning its place:
  Fig A  the accuracy/traceability plane , shows the contribution in one look
  Fig B  effect of the text-layer repair , the new finding, before vs after

Palette #3B82F6 / #E8590C / #0D9488 passed all six checks of the validator
(lightness band, chroma floor, CVD separation, normal-vision floor, contrast).
Every mark is also directly labelled, so identity is never colour-alone.

Rendered at 600 dpi to match the existing artwork (~621 dpi effective).
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

BLUE, ORANGE, TEAL = "#3B82F6", "#E8590C", "#0D9488"
INK, MUTED, GRID = "#1A1A1A", "#666666", "#DDDDDD"
DPI = 600

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 8,
    "axes.edgecolor": "#999999",
    "axes.linewidth": 0.8,
    "axes.labelcolor": INK,
    "xtick.color": MUTED, "ytick.color": MUTED,
    "xtick.labelsize": 7.5, "ytick.labelsize": 7.5,
})

# ---------------------------------------------------------------- data
# accuracy of 20 golden values; traceable % = share of surfaced values locatable
# in the source. Filled from the pinned campaign after the text-layer repair.
CONFIGS = [
    # label,                      accuracy, traceable%, leaky?, label offset
    # Ten pinned runs on the four labelled documents, after the text-layer repair.
    ("Deterministic only",             13.0, 100.0, False, (0, 11)),
    ("Language model alone",           15.5,  81.5, True,  (0, -15)),
    ("Hybrid, ungated",                18.0,  82.0, True,  (0, 11)),
    ("Workflow, strict gate",          16.0, 100.0, False, (0, -15)),
    ("Workflow, relaxed gate",         18.0, 100.0, False, (0, 11)),
]

# 26-document corpus, gated coverage of 572 slots and ungated ungrounded share
PARSER_EFFECT = {
    "Gated coverage\n(of 572 field slots)": (294.7, None),   # before, after
    "Untraceable share of the\nungated hybrid (%)": (29.7, None),
}


def fig_plane(path):
    fig, ax = plt.subplots(figsize=(5.2, 3.5))

    # the band that matters: everything a practitioner can act on without
    # re-reading the tender sits on the 100 % line
    ax.add_patch(Rectangle((11.6, 99.1), 7.4, 2.3, facecolor=BLUE, alpha=0.07,
                           edgecolor="none", zorder=0))
    # caption sits just below the band, clear of every marker
    ax.text(11.78, 98.0, "fully traceable, usable without re-reading the source",
            fontsize=6.4, color=BLUE, va="center", style="italic", zorder=1)

    for label, acc, trace, leaky, off in CONFIGS:
        colour = ORANGE if leaky else BLUE
        ax.scatter(acc, trace, s=64, color=colour, zorder=3,
                   edgecolor="white", linewidth=1.1)
        ax.annotate(label, (acc, trace), textcoords="offset points", xytext=off,
                    ha="center", fontsize=7.2, color=INK, zorder=4)

    # the claim, drawn: relaxed gate matches ungated accuracy at full traceability
    ax.annotate("", xy=(18.0, 98.6), xytext=(18.0, 83.6),
                arrowprops=dict(arrowstyle="->", color=MUTED, lw=0.9,
                                linestyle=(0, (3, 2))))
    ax.text(17.82, 91.0, "verification now costs\nno accuracy", fontsize=6.8,
            color=MUTED, va="center", ha="right")

    ax.set_xlabel("Accuracy (of 20 hand-verified values)  →  better")
    ax.set_ylabel("Surfaced values locatable in source (%)  →  better")
    ax.set_xlim(11.6, 19.0)
    ax.set_ylim(72, 103)
    ax.set_yticks([75, 80, 85, 90, 95, 100])
    ax.grid(axis="both", color=GRID, linewidth=0.5, zorder=0)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {path}")


def fig_parser(path):
    fig, axes = plt.subplots(1, 2, figsize=(5.6, 2.5))
    for ax, (title, (before, after)) in zip(axes, PARSER_EFFECT.items()):
        if after is None:
            ax.text(0.5, 0.5, "awaiting 3-run campaign", ha="center", va="center",
                    fontsize=7, color=MUTED, transform=ax.transAxes)
            ax.set_title(title, fontsize=7.5, color=INK)
            ax.set_xticks([]); ax.set_yticks([])
            for s in ax.spines.values():
                s.set_visible(False)
            continue
        ax.plot([0, 1], [before, after], color=GRID, lw=2, zorder=1,
                solid_capstyle="round")
        ax.scatter([0], [before], s=70, color=MUTED, zorder=3, edgecolor="white", lw=1.1)
        ax.scatter([1], [after], s=70, color=TEAL, zorder=3, edgecolor="white", lw=1.1)
        ax.annotate(f"{before:.1f}", (0, before), textcoords="offset points",
                    xytext=(0, 12), ha="center", fontsize=7.4, color=MUTED)
        ax.annotate(f"{after:.1f}", (1, after), textcoords="offset points",
                    xytext=(0, 12), ha="center", fontsize=7.4, color=TEAL, weight="bold")
        ax.set_xlim(-0.45, 1.45)
        pad = max(abs(after - before) * 0.9, 3)
        ax.set_ylim(min(before, after) - pad, max(before, after) + pad)
        ax.set_xticks([0, 1])
        ax.set_xticklabels(["before\nrepair", "after\nrepair"], fontsize=7)
        ax.set_title(title, fontsize=7.5, color=INK, pad=14)
        ax.grid(axis="y", color=GRID, linewidth=0.5)
        ax.set_axisbelow(True)
        for s in ("top", "right", "bottom"):
            ax.spines[s].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {path}")


if __name__ == "__main__":
    base = "C:/Users/milad.komary/Documents/projects/PCAP/paper/figures_new"
    import os
    os.makedirs(base, exist_ok=True)
    # Figure 2 replaces the existing accuracy/ungrounded bar chart: it carries the
    # same two quantities plus the relaxed-gate configuration, so the paper does
    # not end up with two figures making the same point.
    fig_plane(f"{base}/figure2_accuracy_traceability.png")
    fig_parser(f"{base}/figure4_text_layer_repair.png")
