"""Generate synthetic spoken audio comments for the Bioeconomy Futures demo.

Writes short spoken clips (one per selected participant) to ``data/audio/`` plus
a ``manifest.json`` consumed by ``seed_demo.py``. The clips are SYNTHETIC speech
(Microsoft Edge neural voices via ``edge-tts``) authored for teaching; they do
not record real participants. They attach to the post-sort ``text_audio``
question (``q_voice``) and demonstrate Qualis's audio-response feature.

This needs network access and the ``edge-tts`` package, which is NOT a runtime
dependency — run it on demand without polluting the project venv:

    uv run --with edge-tts python scripts/generate_demo_audio.py

The committed artifacts are the ``.mp3`` files and ``manifest.json``; re-run only
to regenerate them. Spoken register is intentionally looser than the written
post-sort rationales in ``generate_demo_sorts.py``.
"""

import asyncio
import json
import subprocess
from pathlib import Path

QUESTION_KEY = "q_voice"
AUDIO_DIR = Path(__file__).resolve().parents[1] / "data" / "audio"

# (participant_id, language, edge-tts voice, spoken script). Voices are varied
# (male/female) for realism; scripts match each participant's archetype voice
# (A industrial, B sufficiency, C territorial, D justice) in a spoken register.
# Lengths vary on purpose, like real participants — a couple of quick remarks
# alongside more developed ones.
CLIPS = [
    (
        "P01",
        "en",
        "en-GB-RyanNeural",
        "Honestly, for me it all comes down to scale and getting the framework "
        "right. We already have the technology to replace fossil materials — "
        "biorefineries, biotechnology, all of it. What we are missing is the will "
        "to build it big and back it with clear standards and predictable "
        "funding. So those cards went to the top for me. The idea that we should "
        "all just consume less? That went to the bottom — to me that is "
        "defeatism, and it ignores what efficiency and innovation can actually "
        "deliver.",
    ),
    (
        "P05",
        "en",
        "en-US-AriaNeural",
        "My biggest worry with the whole bioeconomy story is that we keep treating "
        "it as a way to carry on exactly as before, just with different inputs. "
        "Swap the plastic for paper, swap the petrol for biofuel, and somehow "
        "growth continues untouched. But biomass is not infinite — the land, the "
        "forests, the soils are already under enormous pressure. So the cards "
        "about ecological limits, and about actually reducing how much we "
        "consume, sat right at the top for me. And the ones claiming there is "
        "plenty of sustainable biomass for everything at once, or that we can "
        "keep growing within the planet's limits — those went straight to the "
        "bottom. Until we are honest about demand, the rest is just window "
        "dressing.",
    ),
    (
        "P07",
        "fr",
        "fr-FR-HenriNeural",
        "Ce qui me frappe, c'est qu'on parle de croissance verte comme si on "
        "pouvait remplacer les intrants et continuer comme avant. Pour moi, tant "
        "qu'on n'accepte pas de réduire la consommation, on tourne autour du pot.",
    ),
    (
        "P09",
        "en",
        "en-US-GuyNeural",
        "What really matters to me is who is actually in control of this. A "
        "bioeconomy that gets designed in a corporate boardroom and scaled up in "
        "giant biorefineries — that is just not the future I want. I would much "
        "rather see it rooted in territories, in farmers, in communities that get "
        "to decide for themselves. So the cards about democratic choice, and "
        "about agroecology being a serious foundation rather than some niche, "
        "went right to the top. The ones celebrating industrial scale and "
        "engineered organisms as the main road — those I pushed to the bottom.",
    ),
    (
        "P11",
        "fr",
        "fr-FR-DeniseNeural",
        "Moi, je pense surtout aux territoires et aux petits producteurs. Si tout "
        "part vers de grandes bioraffineries, on évince les gens qui devraient "
        "être au cœur du projet. L'agroécologie, ce n'est pas une niche.",
    ),
    (
        "P13",
        "en",
        "en-GB-SoniaNeural",
        "For me this whole debate comes down to one question that nobody at the "
        "top really wants to answer: who pays. We talk about a green transition "
        "as if everyone benefits equally, but the land, the resources, the cheap "
        "biomass — a lot of that comes from the Global South, and the costs land "
        "there, and on the poorest people here at home. That is not an accident, "
        "it is how the system is set up. So the statements about displacement, "
        "about who captures the value, about the burden on the poorest — those "
        "are the ones I feel most strongly about. And the claim that the latest "
        "EU strategy is some genuine turning point? I put that at the very "
        "bottom. It mostly reassures people while the extractive logic just "
        "carries on underneath.",
    ),
    (
        "P15",
        "fr",
        "fr-FR-HenriNeural",
        "Pour moi, la vraie question, c'est qui paie. On parle de transition verte "
        "comme si tout le monde y gagnait, mais les coûts retombent sur le Sud "
        "global et sur les plus pauvres, ici aussi. Donc j'ai mis tout en haut "
        "les cartes sur le déplacement des coûts et sur la captation de la "
        "valeur. Et l'idée que la nouvelle stratégie serait un vrai tournant, je "
        "l'ai mise tout en bas : ça rassure, mais ça ne change pas la logique de "
        "fond.",
    ),
]


def _duration_seconds(path: Path) -> float:
    """Probe an audio file's duration with ffprobe (rounded to 0.1s)."""
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return round(float(out.stdout.strip()), 1)


async def main() -> None:
    """Synthesize every clip and write the manifest."""
    try:
        import edge_tts
    except ImportError as exc:  # pragma: no cover - dev tool
        raise SystemExit(
            "edge-tts is required. Run: uv run --with edge-tts python "
            "scripts/generate_demo_audio.py"
        ) from exc

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, object]] = {}
    for pid, lang, voice, text in CLIPS:
        out = AUDIO_DIR / f"{pid}_{QUESTION_KEY}.mp3"
        await edge_tts.Communicate(text, voice).save(str(out))
        duration = _duration_seconds(out)
        manifest[pid] = {
            "file": out.name,
            "question_key": QUESTION_KEY,
            "language": lang,
            "duration_seconds": duration,
        }
        print(f"  {pid}: {out.name} ({duration:.1f}s, {voice})")

    manifest_path = AUDIO_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(manifest)} clips + {manifest_path.name}.")


if __name__ == "__main__":
    asyncio.run(main())
