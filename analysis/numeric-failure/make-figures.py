"""Figures for the numeric representation failure section.

Figure 5  why the grounding gate cannot detect a misreading (mechanism)
Figure 6  parsing outcome by strategy across twelve countries

Palette #3B82F6 / #E8590C / #0D9488 passed all six checks of the colour validator.
Every mark is directly labelled, so identity never depends on colour alone.
Rendered at 600 dpi to match the existing artwork.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

BLUE, ORANGE, TEAL = "#3B82F6", "#E8590C", "#0D9488"
INK, MUTED, GRID, PALE = "#1A1A1A", "#666666", "#DDDDDD", "#F4F6F8"
DPI = 600

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 8,
    "axes.edgecolor": "#999999", "axes.linewidth": 0.8, "axes.labelcolor": INK,
    "xtick.color": MUTED, "ytick.color": MUTED,
    "xtick.labelsize": 7.5, "ytick.labelsize": 7.5,
})


def fig_mechanism(path):
    """The mechanism, drawn once, so the reader needs no worked example in prose."""
    fig, ax = plt.subplots(figsize=(6.3, 3.1))
    ax.set_xlim(0, 100); ax.set_ylim(0, 52); ax.axis("off")

    def box(x, y, w, h, title, body, edge, fill="white"):
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.6,rounding_size=1.2",
                                    linewidth=1.1, edgecolor=edge, facecolor=fill, zorder=2))
        ax.text(x + w / 2, y + h - 4.0, title, ha="center", fontsize=7.0, color=MUTED, zorder=3)
        ax.text(x + w / 2, y + h / 2 - 3.6, body, ha="center", fontsize=9.2, color=INK, zorder=3,
                family="monospace")

    def arrow(x1, y1, x2, y2, colour=MUTED, rad=None):
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=11,
                                     linewidth=1.0, color=colour, zorder=1,
                                     connectionstyle=(f"arc3,rad={rad}" if rad else "arc3")))

    TOP = 33
    box(1, TOP, 27, 16, "printed in the document", '"1 109 916,80"', BLUE, PALE)
    box(37, TOP, 24, 16, "parser matches", '"916,80"', ORANGE)
    box(70, TOP, 28, 16, "value surfaced", "916.80", ORANGE)

    arrow(28.5, TOP + 8, 36.5, TOP + 8)
    arrow(61.5, TOP + 8, 69.5, TOP + 8)
    # label sits BELOW its arrow, clear of both boxes
    ax.text(32.5, TOP + 3.2, "separator\nmissed", ha="center", fontsize=6.3, color=MUTED)

    # the error, placed under the box it refers to with clear separation
    ax.text(84, TOP - 4.6, "reference 1 109 916,80\nwrong by a factor of 1211",
            ha="center", fontsize=6.8, color=ORANGE, va="top")

    # the gate, below, admitting what it should catch
    ax.add_patch(FancyBboxPatch((36, 6), 26, 14, boxstyle="round,pad=0.6,rounding_size=1.2",
                                linewidth=1.1, edgecolor=TEAL, facecolor="white", zorder=2))
    ax.text(49, 16.4, "source-grounding gate", ha="center", fontsize=7.0, color=MUTED, zorder=3)
    ax.text(49, 10.4, 'is "916,80" in the source?', ha="center", fontsize=7.6, color=INK, zorder=3)

    arrow(49, TOP - 0.6, 49, 20.6)
    arrow(62.5, 13, 78, 31.4, TEAL, -0.3)
    ax.text(73.5, 6.6, "YES, it is a substring:\nthe value is admitted",
            ha="center", fontsize=7.0, color=TEAL, weight="bold")

    fig.tight_layout()
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {path}")


def fig_outcomes(path):
    """Three strategies, three outcomes, on the same 87 amounts."""
    strategies = ["Parser as shipped\n(single jurisdiction)",
                  "After the intra-number\nspace repair",
                  "Convention-aware\nparser"]
    correct = [0, 19, 86]
    silent = [42, 43, 0]
    refused = [45, 25, 1]

    fig, ax = plt.subplots(figsize=(5.6, 3.0))
    y = range(len(strategies))
    h = 0.58
    left = [0, 0, 0]
    series = [("correct", correct, TEAL), ("silently wrong", silent, ORANGE), ("refused to parse", refused, "#B8C0C8")]
    for name, vals, colour in series:
        ax.barh([i for i in y], vals, height=h, left=left, color=colour,
                edgecolor="white", linewidth=1.4, zorder=3, label=name)
        for i, v in enumerate(vals):
            if v >= 6:
                ax.text(left[i] + v / 2, i, str(v), ha="center", va="center",
                        fontsize=7.6, color="white", weight="bold", zorder=4)
        left = [left[i] + vals[i] for i in range(len(vals))]

    ax.set_yticks(list(y)); ax.set_yticklabels(strategies, fontsize=7.4)
    ax.invert_yaxis()
    ax.set_xlabel("Published contract values (87 notices, 12 countries)")
    ax.set_xlim(0, 88)
    ax.grid(axis="x", color=GRID, linewidth=0.5)
    ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.34), ncol=3,
              frameon=False, fontsize=7.2)
    fig.tight_layout()
    fig.savefig(path, dpi=DPI, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"wrote {path}")


if __name__ == "__main__":
    import os
    base = os.path.join(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))), "figures")
    os.makedirs(base, exist_ok=True)
    fig_mechanism(f"{base}/figure5_grounding_blind_spot.png")
    fig_outcomes(f"{base}/figure6_parsing_outcomes.png")
