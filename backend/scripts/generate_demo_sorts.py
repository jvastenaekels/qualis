"""Generate the synthetic, factor-structured Q-sorts for the Bioeconomy Futures demo.

This produces ``data/example-study.sorts.json`` consumed by ``seed_demo.py``.
The data is SYNTHETIC and authored for teaching: it is not collected from real
participants. The script is committed so the demo dataset is reproducible and
its design is auditable.

Design
------
Four stakeholder "voices" structure the data (see ``STANCE`` below):
  A  Industrial green-growth optimist
  B  Ecological-limits / sufficiency advocate
  C  Agroecological / territorial localist
  D  Justice-first / decolonial critic

Each voice has an "ideal sort" derived from a stance matrix. Participant sorts
are mild Gaussian perturbations of the ideal (noise on a latent score, then
re-rank). Re-ranking and mapping back onto the forced bell distribution keeps
the distribution exact while letting statements cross score bands realistically.
Two "mixed" participants blend two voices to illustrate confounded loaders.

The intended factor solution is THREE factors (the eigenvalues do not support a
fourth): F1 is bipolar — the industrial voice (A) at one pole, the justice voice
(D) at the other; F2 is the sufficiency voice (B); F3 is the territorial voice
(C). This is deliberate: it shows that designed groups need not map one-to-one
onto extracted factors, and that bipolar factors are real.

Run:  uv run python scripts/generate_demo_sorts.py   (from the backend/ dir)
"""

import json
import random
from itertools import combinations
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "example-study.sorts.json"

CODES = [f"S{i:02d}" for i in range(1, 26)]

# Forced bell distribution: score -> capacity.
GRID = [(-4, 1), (-3, 2), (-2, 3), (-1, 4), (0, 5), (1, 4), (2, 3), (3, 2), (4, 1)]

# Score assigned to each rank (rank 0 = most agree -> +4 ... rank 24 -> -4).
SCORE_BY_RANK: list[int] = []
for _score, _cap in reversed(GRID):
    SCORE_BY_RANK.extend([_score] * _cap)
assert len(SCORE_BY_RANK) == 25, len(SCORE_BY_RANK)

# Stance matrix: how much each voice (A, B, C, D) agrees with each statement,
# in [-2, 2]. Comments name the signature owner of each statement.
STANCE = {
    #        A   B   C   D     signature owner
    "S01": (2, -2, -1, -1),  # enough biomass            A+ / B- (general anti-A)
    "S02": (-1, 1, 1, 0),  # binding cascading law       mild
    "S03": (-2, 2, 0, 1),  # bioenergy not neutral       B
    "S04": (0, 1, 0, 0),  # reward storing materials     mild B
    "S05": (2, 0, -2, -1),  # big biorefineries           A vs C
    "S06": (-2, 1, 2, 0),  # agroecology foundation       C
    "S07": (2, -1, -2, -1),  # industrial scale = impact  A vs C
    "S08": (2, -2, -1, -1),  # green growth in limits     B- (general anti-A)
    "S09": (-2, 2, 1, 0),  # consume less                 B
    "S10": (2, -1, 0, -1),  # substitution = progress     A
    "S11": (-2, 2, 1, 1),  # green-growth avoids it       B
    "S12": (-2, 0, 1, 2),  # costs onto Global South      D
    "S13": (2, -1, 0, -2),  # shared prosperity / win-win  A (justice counter-pole)
    "S14": (-1, 0, 1, 2),  # who owns/profits matters     D
    "S15": (-2, 0, 2, 1),  # certs/funding favour big     C (D mild)
    "S16": (2, 0, -1, -1),  # standards > grand visions   A
    "S17": (-1, 0, 2, 1),  # decide democratically        C (D mild)
    "S18": (-2, 1, 1, 1),  # hype / stranded assets       shared critical
    "S19": (1, -1, -1, -2),  # strategy genuine           D- (anti-greenwash)
    "S20": (-1, 0, 2, 1),  # keep open and plural         C
    "S21": (2, -1, -1, 0),  # top-down policy works       A
    "S22": (-1, 1, 2, 0),  # change from movements        C
    "S23": (0, 2, 1, 0),  # production+consumption        B
    "S24": (-2, 0, 0, 1),  # muddle through               D mild (anti-A)
    "S25": (2, -1, -2, -1),  # biotech essential          A vs C
}
ARCH_INDEX = {"A": 0, "B": 1, "C": 2, "D": 3}


def stance_vec(arch):
    """Stance dict {code: value} for a single voice."""
    i = ARCH_INDEX[arch]
    return {c: STANCE[c][i] for c in CODES}


def blended_vec(a, b):
    """Average two voices' stance vectors (for mixed/confounded participants)."""
    va, vb = stance_vec(a), stance_vec(b)
    return {c: (va[c] + vb[c]) / 2 for c in CODES}


def ideal_ranking(vec):
    """Order codes most-agree -> most-disagree.

    Primary key: stance (desc). Tie-break: distance of this profile's stance
    from the global mean (desc) so distinctive items go to the extremes.
    """

    def disc(code):
        return vec[code] - sum(STANCE[code]) / 4.0

    return sorted(CODES, key=lambda c: (-vec[c], -disc(c), c))


def ranking_to_scores(ranking):
    """Map a full ranking onto the forced bell distribution."""
    return {ranking[r]: SCORE_BY_RANK[r] for r in range(25)}


def perturb(vec, seed, sigma):
    """Add Gaussian noise to a latent score per statement, then re-rank.

    Larger sigma => looser loading on the voice (more idiosyncratic).
    """
    rnd = random.Random(seed)

    def disc(code):
        return vec[code] - sum(STANCE[code]) / 4.0

    latent = {c: vec[c] + 0.15 * disc(c) + rnd.gauss(0, sigma) for c in CODES}
    return sorted(CODES, key=lambda c: (-latent[c], c))


def pearson(d1, d2):
    """Pearson correlation between two {code: score} dicts."""
    xs = [d1[c] for c in CODES]
    ys = [d2[c] for c in CODES]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs) ** 0.5
    vy = sum((y - my) ** 2 for y in ys) ** 0.5
    return cov / (vx * vy) if vx and vy else 0.0


# ---- Rationale / comment templates (worldview-level, EN + FR, 2 variants) ----

RATIONALE = {
    "A": {
        "en": [
            "I put the statements about scale, biotechnology and substitution at the top because that is where real climate impact comes from — good intentions only matter once they reach industrial volume. At the bottom I rejected the idea that we must simply consume less; the bioeconomy's whole promise is that we can keep growing while replacing fossil inputs.",
            "My +4 cards are the ones saying that clear standards, scale and bio-based substitution drive the transition. My -4 is the claim that growth and ecological limits are incompatible — I think that framing is defeatist and ignores what efficiency and technology can deliver.",
        ],
        "fr": [
            "J'ai placé en haut les énoncés sur l'échelle, la biotechnologie et la substitution, car c'est là que se joue le véritable effet climatique — les bonnes intentions ne comptent qu'une fois passées à l'échelle industrielle. En bas, j'ai rejeté l'idée qu'il faudrait simplement consommer moins ; toute la promesse de la bioéconomie est de pouvoir continuer à croître en remplaçant les intrants fossiles.",
            "Mes cartes +4 sont celles qui disent que des normes claires, l'échelle et la substitution biosourcée portent la transition. Mon -4 est l'idée que croissance et limites écologiques seraient incompatibles — un cadrage défaitiste qui ignore ce que l'efficacité et la technologie peuvent apporter.",
        ],
    },
    "B": {
        "en": [
            "At the top I placed the statements about ecological limits and reducing consumption, because substitution and recycling cannot outrun absolute demand — that is the heart of it for me. At the bottom I rejected the claim that there is plenty of sustainable biomass and that green growth keeps us within limits; the evidence on the land sink and imports says otherwise.",
            "My most-agree cards are the ones challenging the 'green growth' story and insisting we burn far too much biomass for energy. My most-disagree are the abundance and growth-within-limits claims — I read those as wishful thinking that defers the hard question.",
        ],
        "fr": [
            "J'ai placé en haut les énoncés sur les limites écologiques et la réduction de la consommation, car la substitution et le recyclage ne peuvent pas dépasser la demande absolue — c'est l'essentiel pour moi. En bas, j'ai rejeté l'idée qu'il y aurait abondance de biomasse durable et que la croissance verte nous maintiendrait dans les limites ; les données sur le puits de carbone et les importations disent le contraire.",
            "Mes cartes « tout à fait d'accord » contestent le récit de la « croissance verte » et rappellent qu'on brûle bien trop de biomasse pour l'énergie. Mes cartes « pas du tout d'accord » sont les promesses d'abondance et de croissance dans les limites — j'y vois un vœu pieux qui repousse la vraie question.",
        ],
    },
    "C": {
        "en": [
            "I ranked agroecology, democratic control and keeping the future open at the very top — for me the bioeconomy has to be rooted in territories and in food sovereignty, not designed in a boardroom. At the bottom I put the idea that the future belongs to large biorefineries and engineered organisms; that path crowds out the small producers who should be at the centre.",
            "My +4 cards say that decisions should be democratic and that an agroecological base is realistic, not niche. My -4 cards are the ones celebrating industrial scale and biotechnology as the main road — I think that locks us into exactly the model we should be questioning.",
        ],
        "fr": [
            "J'ai classé tout en haut l'agroécologie, le contrôle démocratique et le maintien d'un avenir ouvert — pour moi, la bioéconomie doit être ancrée dans les territoires et dans la souveraineté alimentaire, et non conçue dans un conseil d'administration. En bas, j'ai mis l'idée que l'avenir appartiendrait aux grandes bioraffineries et aux organismes modifiés ; cette voie évince les petits producteurs qui devraient être au centre.",
            "Mes cartes +4 disent que les décisions doivent être démocratiques et qu'une base agroécologique est réaliste, pas marginale. Mes cartes -4 célèbrent l'échelle industrielle et la biotechnologie comme voie principale — j'y vois un verrouillage dans le modèle même qu'il faudrait questionner.",
        ],
    },
    "D": {
        "en": [
            "What I agree with most are the statements about who carries the costs and who captures the value — the transition pushes its burden onto the Global South, and that is not incidental. At the bottom I rejected the rosy official framing: the idea that the latest strategy is a genuine turning point, and the claim that the benefits will simply be spread around. To me that mostly absorbs criticism while the extractive logic continues.",
            "My top cards foreground justice: displacement and who really captures the value. My most-disagree cards are the reassuring ones — that the new strategy is a real reorientation, or that a well-run transition will share its benefits broadly. I read both as ways to delay structural change.",
        ],
        "fr": [
            "Ce avec quoi je suis le plus d'accord, ce sont les énoncés sur qui porte les coûts et qui capte la valeur — la transition reporte son fardeau sur le Sud global, et ce n'est pas accidentel. En bas, j'ai rejeté le cadrage rassurant officiel : l'idée que la dernière stratégie serait un véritable tournant, et celle que les bénéfices seraient simplement partagés. Pour moi, cela absorbe surtout la critique pendant que la logique extractive se poursuit.",
            "Mes cartes du haut mettent la justice au premier plan : le déplacement des coûts et la captation de la valeur. Mes cartes « pas du tout d'accord » sont les plus rassurantes — l'idée que la nouvelle stratégie serait une vraie réorientation, ou qu'une transition bien menée partagerait largement ses bénéfices. J'y vois deux manières de repousser le changement structurel.",
        ],
    },
    "M_BC": {
        "en": [
            "I find myself agreeing both with the ecological-limits people and with the territorial, agroecological camp — less consumption, more democracy, and a future kept open. My sort sits between those two, so my extremes are about limits and local control rather than any single doctrine.",
        ],
        "fr": [
            "Je me retrouve à la fois chez les tenants des limites écologiques et chez le camp territorial et agroécologique — consommer moins, plus de démocratie, et un avenir maintenu ouvert. Mon tri se situe entre les deux, donc mes extrêmes portent sur les limites et le contrôle local plus que sur une doctrine unique.",
        ],
    },
    "M_CD": {
        "en": [
            "For me the local and the justice questions go together: who decides and who pays. I care both about keeping production territorial and democratic and about not dumping the costs on the Global South, so my strong cards are spread across those two concerns rather than one clear camp.",
        ],
        "fr": [
            "Pour moi, la question locale et la question de justice vont ensemble : qui décide et qui paie. Je tiens à la fois à une production territoriale et démocratique et à ne pas reporter les coûts sur le Sud global, donc mes cartes fortes se répartissent entre ces deux préoccupations plutôt que dans un camp unique.",
        ],
    },
}

TOP_CARD_COMMENT = {
    "A": {
        "en": "This is the crux for me — without it the rest is just good intentions.",
        "fr": "C'est le nœud pour moi — sans cela, le reste n'est que de bonnes intentions.",
    },
    "B": {
        "en": "I feel strongly about this one; it's the question everything else avoids.",
        "fr": "J'ai un avis très tranché là-dessus ; c'est la question que tout le reste évite.",
    },
    "C": {
        "en": "This is non-negotiable for me — it's where the bioeconomy should start.",
        "fr": "Pour moi c'est non négociable — c'est là que la bioéconomie devrait commencer.",
    },
    "D": {
        "en": "This is the part the official story keeps quiet about.",
        "fr": "C'est la partie que le récit officiel passe sous silence.",
    },
}

# (id, profile, language, q_perspective, sector, familiarity, confidence,
#  give_top_comment, general_comment_key). profile is "A"/"B"/"C"/"D" or a
# ("M", x, y) blend.
ROSTER = [
    ("P01", "A", "en", "industry", "industry", 5, 5, True, None),
    ("P02", "A", "en", "industry", "industry", 4, 4, False, None),
    ("P03", "A", "fr", "public_actor", "public", 4, 4, False, "more_standards"),
    ("P04", "A", "en", "researcher", "research", 5, 5, True, None),
    ("P05", "B", "en", "researcher", "research", 5, 5, True, None),
    ("P06", "B", "en", "civil_society", "civil_society", 4, 4, False, None),
    ("P07", "B", "fr", "researcher", "research", 5, 4, False, "limits_missing"),
    ("P08", "B", "en", "citizen", "none", 3, 3, False, None),
    ("P09", "C", "en", "farmer", "farming", 4, 5, True, None),
    ("P10", "C", "en", "civil_society", "civil_society", 4, 4, False, None),
    ("P11", "C", "fr", "farmer", "farming", 3, 4, False, "labelling_missing"),
    ("P12", "C", "en", "citizen", "none", 2, 3, False, None),
    ("P13", "D", "en", "civil_society", "civil_society", 5, 5, True, None),
    ("P14", "D", "en", "researcher", "research", 5, 4, False, None),
    ("P15", "D", "fr", "citizen", "none", 3, 4, False, None),
    ("P16", "D", "en", "civil_society", "civil_society", 4, 5, False, None),
    ("P17", ("M", "B", "C"), "fr", "civil_society", "civil_society", 3, 3, False, None),
    ("P18", ("M", "C", "D"), "en", "citizen", "none", 3, 2, False, "torn"),
]

GENERAL_COMMENTS = {
    "more_standards": {
        "en": "I'd have liked a card specifically about harmonising standards across member states.",
        "fr": "J'aurais aimé une carte portant spécifiquement sur l'harmonisation des normes entre États membres.",
    },
    "limits_missing": {
        "en": "Nothing here really captures planetary boundaries as a hard constraint rather than a slogan.",
        "fr": "Rien ici ne saisit vraiment les limites planétaires comme une contrainte ferme plutôt qu'un slogan.",
    },
    "labelling_missing": {
        "en": "There could be a statement about consumer information and labelling of bio-based products.",
        "fr": "Il pourrait y avoir un énoncé sur l'information des consommateurs et l'étiquetage des produits biosourcés.",
    },
    "torn": {
        "en": "Several of these I could have placed either way depending on the day.",
        "fr": "Plusieurs de ces cartes, j'aurais pu les placer dans un sens ou dans l'autre selon le jour.",
    },
}

# Per-profile noise (sigma). Mixed profiles get a touch more so they do not
# accidentally form their own clean factor.
PERTURB = {"A": 0.85, "B": 0.62, "C": 0.92, "D": 0.70, "M": 1.15}
BASE_SEED = 20260617


def profile_vec_and_key(profile):
    """Return (stance vector, short profile key) for a roster profile."""
    if isinstance(profile, tuple):  # ("M", x, y)
        _, a, b = profile
        return blended_vec(a, b), "M"
    return stance_vec(profile), profile


def rationale_for(profile, lang, idx):
    """Pick a rationale variant for a profile, cycling by participant index."""
    if isinstance(profile, tuple):
        variants = RATIONALE["M_" + profile[1] + profile[2]][lang]
    else:
        variants = RATIONALE[profile][lang]
    return variants[idx % len(variants)]


def build():
    """Build the sorts, validate, print diagnostics, and write the JSON file."""
    out = {}
    score_dicts = {}
    profile_of = {}
    per_profile_counter = {}

    for n, row in enumerate(ROSTER):
        pid, profile, lang, persp, sector, fam, conf, top_comment, gc_key = row
        vec, pkey = profile_vec_and_key(profile)
        ranking = perturb(vec, BASE_SEED + n, PERTURB[pkey])
        scores = ranking_to_scores(ranking)
        score_dicts[pid] = scores
        profile_of[pid] = pkey

        idx = per_profile_counter.get(pkey, 0)
        per_profile_counter[pkey] = idx + 1

        top_code = next(c for c, s in scores.items() if s == 4)
        card_comments = {}
        if top_comment and not isinstance(profile, tuple):
            card_comments[top_code] = TOP_CARD_COMMENT[profile][lang]

        out[pid] = {
            "archetype": pkey
            if not isinstance(profile, tuple)
            else "+".join(profile[1:]),
            "language": lang,
            "presort": {"familiarity": fam, "sector": sector},
            "qsort": {c: scores[c] for c in CODES},
            "card_comments": card_comments,
            "postsort": {
                "q_rationale": rationale_for(profile, lang, idx),
                "q_perspective": persp,
                "q_confidence": conf,
            },
            "general_comment": GENERAL_COMMENTS[gc_key][lang] if gc_key else "",
            "missing_statement": "",
        }

    _diagnostics(score_dicts, profile_of)
    OUT.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nWrote {OUT} ({len(out)} participants).")


def _diagnostics(score_dicts, profile_of):
    """Assert valid distributions and print the correlation structure."""
    target = {score: cap for score, cap in GRID}
    for pid, scores in score_dicts.items():
        dist = {}
        for s in scores.values():
            dist[s] = dist.get(s, 0) + 1
        assert dist == target, f"{pid} bad distribution: {dist}"
    print(f"All {len(score_dicts)} sorts respect the forced bell distribution.")

    print("\nMean within-profile correlation:")
    for p in sorted(set(profile_of.values())):
        ids = [pid for pid in score_dicts if profile_of[pid] == p]
        if len(ids) < 2:
            continue
        cors = [
            pearson(score_dicts[a], score_dicts[b]) for a, b in combinations(ids, 2)
        ]
        print(f"  within {p}: {sum(cors) / len(cors):+.2f}  (n={len(ids)})")

    print("\nCross-profile mean correlation (ideal vectors):")
    ideal = {
        p: ranking_to_scores(ideal_ranking(stance_vec(p))) for p in ["A", "B", "C", "D"]
    }
    for a, b in combinations(["A", "B", "C", "D"], 2):
        print(f"  {a} vs {b}: {pearson(ideal[a], ideal[b]):+.2f}")


if __name__ == "__main__":
    build()
