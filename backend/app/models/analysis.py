# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""AnalysisRun model."""

from .base import (
    Any,
    Base,
    DateTime,
    ForeignKey,
    JSON,
    Mapped,
    SmallInteger,
    String,
    datetime,
    func,
    mapped_column,
    relationship,
)


class AnalysisRun(Base):
    """Persisted record of a Q-method factor analysis execution.

    Captures both the analytical choices the researcher made (extraction,
    rotation, n_factors, flagging mode/threshold) and the full result, so
    that analytical decisions are auditable across sessions and visible to
    co-authors and reviewers. This supports the critical Q-methodology
    requirement that analytical choices be transparent (Stainton Rogers
    1997; Watts & Stenner 2012; Sneegas 2020).

    Every successful call to the analysis endpoint creates one row. The
    researcher can annotate runs with a `notes` field (e.g., "final
    analysis used in submission"), document a per-factor interpretive
    narrative in `factor_notes` (Sneegas 2020 — narrative interpretation
    of each factor is part of critical Q practice), and delete experimental
    runs they no longer need. Both `notes` and `factor_notes` are mutable;
    the analytical choices and the `result` payload are immutable.
    """

    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    # Nullable so that deleting a user does not blow away the audit trail —
    # the analytical choices remain visible even if the researcher account
    # is removed.
    ran_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ran_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Analytical choices — the audit trail
    extraction_method: Mapped[str] = mapped_column(String(20))  # "pca" | "centroid"
    n_factors: Mapped[int] = mapped_column(SmallInteger)
    rotation_method: Mapped[str] = mapped_column(String(20))  # "varimax" | "none"
    flagging_mode: Mapped[str] = mapped_column(String(20))  # "auto" | "manual"

    # Researcher annotation (free text, e.g. "submission v2", "exploratory")
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    # Per-factor interpretive narrative. Keys are stringified 1-indexed
    # factor numbers ("1", "2", ...); values are free-text narratives capped
    # at 4000 chars at the API boundary. Defaults to {} for new and pre-existing
    # rows (server_default in the migration covers the latter).
    factor_notes: Mapped[dict[str, str]] = mapped_column(
        JSON, default=dict, server_default="{}"
    )

    # Full result payload (the AnalysisResult Pydantic model serialized).
    # JSON (not JSONB) to stay consistent with other persisted configs.
    result: Mapped[dict[str, Any]] = mapped_column(JSON)

    # Relationships
    study: Mapped["Study"] = relationship(lazy="raise")  # type: ignore[name-defined]  # noqa: F821
    ran_by: Mapped["User | None"] = relationship(lazy="raise")  # type: ignore[name-defined]  # noqa: F821


__all__ = ["AnalysisRun"]
