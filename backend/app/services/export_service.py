"""Service for exporting study results in various formats."""

import csv
import io
import logging
import zipfile
from datetime import datetime
from typing import Any

from ..models import Participant, Study, Statement
from .storage_service import storage_service

logger = logging.getLogger(__name__)


class ExportService:
    """Service for exporting study results."""

    @staticmethod
    def generate_csv(study: Study, participants: list[Participant]) -> str:
        """Generates a CSV string of participant data and Q-sort scores."""
        output = io.StringIO()
        writer = csv.writer(output)

        # Use study's default language for headers/labels if available, else English
        header_lang = study.default_language or "en"

        # Helper to get human label for a question ID or option value from config
        def get_label(config_dict: dict, q_id: str, lang: str = "en") -> str:
            q_config = config_dict.get(q_id, {})
            label_obj = q_config.get("label", q_id)
            if isinstance(label_obj, dict):
                return str(
                    label_obj.get(lang)
                    or label_obj.get("en")
                    or next(iter(label_obj.values()), q_id)
                )
            return str(label_obj)

        def get_value_label(
            config_dict: dict, q_id: str, value: Any, lang: str = "en"
        ) -> str:
            """Resolves internal value (like 'm') to its label (like 'Male')."""
            if value is None or value == "":
                return ""

            q_config = config_dict.get(q_id, {})
            options = q_config.get("options", [])
            if not options:
                return str(value)

            # Look for option by 'value' or 'id'
            for opt in options:
                if str(opt.get("value")) == str(value) or str(opt.get("id")) == str(
                    value
                ):
                    label_obj = opt.get("label", value)
                    if isinstance(label_obj, dict):
                        return str(
                            label_obj.get(lang)
                            or label_obj.get("en")
                            or next(iter(label_obj.values()), value)
                        )
                    return str(label_obj)
            return str(value)

        # 1. Resolve Configs
        presort_fields = {}
        if study.presort_config:
            if "fields" in study.presort_config:
                presort_fields = study.presort_config.get("fields", {})
            elif "enabled" not in study.presort_config:
                presort_fields = study.presort_config

        postsort_fields = {}
        if study.postsort_config:
            if "questions" in study.postsort_config:
                postsort_fields = study.postsort_config.get("questions", {})
            elif "extreme_columns" not in study.postsort_config:
                postsort_fields = study.postsort_config

        # 2. Header Construction
        sorted_statements = sorted(study.statements, key=lambda s: s.display_order)

        header = [
            "Participant_UID",
            "Confirmation_Code",
            "Language",
            "Status",
            "Submitted_At",
            "Duration_Seconds",
            "IP_Hash",
            "User_Agent",
            "Is_Discarded",
            "Discard_Reason",
            "Is_Test_Run",
        ]

        # Add Presort questions with labels
        presort_keys = list(presort_fields.keys())
        header.extend(
            [f"Pre_{get_label(presort_fields, k, header_lang)}" for k in presort_keys]
        )

        # Add Statement Scores + Card Comments + Audio
        for s in sorted_statements:
            header.append(s.code)  # Score
            header.append(f"{s.code}_Comment")  # Text comment
            header.append(f"{s.code}_Audio_URL")  # Audio presigned URL
            header.append(f"{s.code}_Audio_Duration_Sec")  # Audio duration
            header.append(f"{s.code}_Audio_FileSize_KB")  # Audio file size

        # Add Postsort questions with labels
        postsort_keys = list(postsort_fields.keys())
        header.extend(
            [
                f"Post_{get_label(postsort_fields, k, header_lang)}"
                for k in postsort_keys
            ]
        )

        # Add audio columns for postsort questions (missing_statement, etc.)
        # Check if audio is enabled in config
        audio_enabled = False
        if study.postsort_config and isinstance(study.postsort_config, dict):
            audio_config = study.postsort_config.get("audio", {})
            audio_enabled = audio_config.get("enabled", False)

        if audio_enabled:
            # Add columns for questions that might have audio recordings
            header.extend(
                [
                    "Missing_Statement_Audio_URL",
                    "Missing_Statement_Audio_Duration_Sec",
                    "Missing_Statement_Audio_FileSize_KB",
                ]
            )

        writer.writerow(header)

        # 3. Rows
        for p in participants:
            duration = None
            if p.submitted_at and p.consented_at:
                duration = int((p.submitted_at - p.consented_at).total_seconds())

            row = [
                str(p.session_token),
                p.confirmation_code or "",
                p.language_used,
                p.status.value,
                p.submitted_at.isoformat() if p.submitted_at else "",
                str(duration) if duration is not None else "",
                p.ip_address or "",
                p.user_agent or "",
                "True" if p.is_discarded else "False",
                p.discard_reason or "",
                "True" if p.is_test_run else "False",
            ]

            # Presort
            for k in presort_keys:
                val = p.presort_answers.get(k)
                row.append(get_value_label(presort_fields, k, val, header_lang))

            # Build audio recordings map by question_key
            audio_map = {}
            for audio_rec in p.audio_recordings:
                # Generate fresh presigned URL (valid for 24 hours)
                try:
                    presigned_url = storage_service.generate_presigned_url(
                        audio_rec.s3_key, expiration=3600
                    )
                    audio_map[audio_rec.question_key] = {
                        "url": presigned_url,
                        "duration": audio_rec.duration_seconds,
                        "size_kb": round(audio_rec.file_size_bytes / 1024, 2),
                    }
                except Exception as e:
                    # Log error but don't fail export
                    logger.warning(
                        "Failed to generate presigned URL for %s: %s",
                        audio_rec.s3_key,
                        e,
                    )

            # Build card comments map from qsort_entries
            comments_map = {
                entry.statement_id: entry.card_comment or ""
                for entry in p.qsort_entries
            }

            # Q-Sort Scores + Card Comments + Audio
            scores_map = {
                entry.statement_id: entry.grid_score for entry in p.qsort_entries
            }
            for s in sorted_statements:
                # Score
                score = scores_map.get(s.id)
                row.append(str(score) if score is not None else "")

                # Text Comment
                comment = comments_map.get(s.id, "")
                row.append(comment)

                # Audio (URL, Duration, FileSize)
                audio_key = f"card_{s.id}"
                audio_data = audio_map.get(audio_key)
                if audio_data:
                    row.append(str(audio_data["url"]))
                    row.append(
                        str(audio_data["duration"]) if audio_data["duration"] else ""
                    )
                    row.append(str(audio_data["size_kb"]))
                else:
                    row.extend(["", "", ""])  # No audio

            # Postsort
            for k in postsort_keys:
                val = p.postsort_answers.get(k)
                row.append(get_value_label(postsort_fields, k, val, header_lang))

            # Postsort Audio (missing_statement, etc.)
            if audio_enabled:
                missing_audio = audio_map.get("missing_statement")
                if missing_audio:
                    row.append(str(missing_audio["url"]))
                    row.append(
                        str(missing_audio["duration"])
                        if missing_audio["duration"]
                        else ""
                    )
                    row.append(str(missing_audio["size_kb"]))
                else:
                    row.extend(["", "", ""])

            writer.writerow(row)

        return output.getvalue()

    @staticmethod
    def generate_pqmethod_zip(study: Study, participants: list[Participant]) -> bytes:
        """Generates a ZIP containing .dat, .sta, and .ans files for PQMethod."""
        zip_buffer = io.BytesIO()

        # Sort statements for consistency across all files
        sorted_statements = sorted(study.statements, key=lambda s: s.display_order)

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Generate .sta (Statements)
            sta_content = ExportService._generate_sta(study, sorted_statements)
            zip_file.writestr(f"{study.slug}.sta", sta_content)

            # 2. Generate .dat (Data Matrix)
            dat_content = ExportService._generate_dat(
                study, participants, sorted_statements
            )
            zip_file.writestr(f"{study.slug}.dat", dat_content)

            # 3. Generate .ans (Project Info)
            ans_content = ExportService._generate_ans(study, participants)
            zip_file.writestr(f"{study.slug}.ans", ans_content)

        return zip_buffer.getvalue()

    @staticmethod
    def generate_r_kit(study: Study, participants: list[Participant]) -> bytes:
        """Generates a ZIP containing CSV data and an R analysis script."""
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. The Data CSV
            csv_content = ExportService.generate_csv(study, participants)
            zip_file.writestr("q_data.csv", csv_content)

            # 2. The R Script
            r_script = ExportService._generate_r_script(study)
            zip_file.writestr("analysis.R", r_script)

        return zip_buffer.getvalue()

    @staticmethod
    def generate_research_package(
        study: Study,
        participants: list[Participant],
        full_dump: dict[str, Any] | None = None,
    ) -> bytes:
        """Generates a ZIP containing the complete research data package."""
        zip_buffer = io.BytesIO()

        # Sort statements for consistency
        sorted_statements = sorted(study.statements, key=lambda s: s.display_order)

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Main Data CSV
            csv_content = ExportService.generate_csv(study, participants)
            zip_file.writestr("data_all.csv", csv_content)

            # 2. JSON Dump
            if full_dump:
                import json

                zip_file.writestr("data_all.json", json.dumps(full_dump, indent=2))

            # 3. Codebook (Text)
            codebook = ExportService.generate_codebook(study)
            zip_file.writestr("codebook.txt", codebook)

            # 4. Statements Reference (CSV)
            statements_csv = ExportService.generate_statements_reference(study)
            zip_file.writestr("statements.csv", statements_csv)

            # 5. PQMethod formats
            zip_file.writestr(
                f"pqmethod/{study.slug}.sta",
                ExportService._generate_sta(study, sorted_statements),
            )
            zip_file.writestr(
                f"pqmethod/{study.slug}.dat",
                ExportService._generate_dat(study, participants, sorted_statements),
            )
            zip_file.writestr(
                f"pqmethod/{study.slug}.ans",
                ExportService._generate_ans(study, participants),
            )

            # 6. R-Kit
            zip_file.writestr("r_kit/q_data.csv", csv_content)
            zip_file.writestr(
                "r_kit/analysis.R", ExportService._generate_r_script(study)
            )

        return zip_buffer.getvalue()

    @staticmethod
    def generate_codebook(study: Study) -> str:
        """Generates a human-readable text documentation of the study structure."""
        lang = study.default_language or "en"
        lines = [
            f"STUDY CODEBOOK: {study.slug}",
            f"Generated: {datetime.now().isoformat()}",
            "=" * 40,
            "",
            "1. STUDY INFO",
            f"- State: {study.state.value}",
            f"- Default Language: {lang}",
            f"- Participant Count: {len(study.participants)}",
            "",
            "2. SURVEY RADIOS/SELECTS (Internal Keys -> Labels)",
        ]

        configs = [
            ("PRESORT", study.presort_config),
            ("POSTSORT", study.postsort_config),
        ]

        for section, config in configs:
            fields: dict[str, Any] = {}
            if section == "PRESORT":
                fields = config.get("fields", {}) if "fields" in config else config
            else:
                fields = (
                    config.get("questions", {}) if "questions" in config else config
                )

            if fields:
                lines.append(f"\n--- {section} ---")
                for q_id, q_cfg in fields.items():
                    if not isinstance(q_cfg, dict):
                        continue
                    label = q_cfg.get("label", q_id)
                    if isinstance(label, dict):
                        label = label.get(lang) or label.get("en") or q_id

                    lines.append(f"Field: {q_id}")
                    lines.append(f"  Label: {label}")

                    options = q_cfg.get("options", [])
                    if options:
                        lines.append("  Options:")
                        for opt in options:
                            opt_val = opt.get("id") or opt.get("value")
                            opt_label = opt.get("label", opt_val)
                            if isinstance(opt_label, dict):
                                opt_label = (
                                    opt_label.get(lang)
                                    or opt_label.get("en")
                                    or opt_val
                                )
                            lines.append(f"    - {opt_val}: {opt_label}")
                    lines.append("")

        lines.append("3. STATEMENTS REFERENCE")
        for s in sorted(study.statements, key=lambda x: x.display_order):
            lines.append(f"Code: {s.code}")
            for t in s.translations:
                lines.append(f"  [{t.language_code}] {t.text.replace('\n', ' ')}")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def generate_statements_reference(study: Study) -> str:
        """Generates a CSV mapping statement codes to all their translations."""
        output = io.StringIO()
        writer = csv.writer(output)

        # Languages present in the study
        langs = sorted(
            list(
                set(
                    trans.language_code
                    for s in study.statements
                    for trans in s.translations
                )
            )
        )

        header = ["Statement_Code"] + [f"Text_{lang_code}" for lang_code in langs]
        writer.writerow(header)

        for statement in sorted(study.statements, key=lambda x: x.display_order):
            row = [statement.code]
            trans_map = {
                trans.language_code: trans.text.replace("\n", " ")
                for trans in statement.translations
            }
            for lang_code in langs:
                row.append(trans_map.get(lang_code, ""))
            writer.writerow(row)

        return output.getvalue()

    @staticmethod
    def _generate_sta(study: Study, statements: list[Statement]) -> str:
        """Generates .sta file content (Statement list)."""
        lines = []
        lang = study.default_language or "en"
        for s in statements:
            # PQMethod expects one statement per line
            text = s.code
            if s.translations:
                # Find translation for study's default language
                translation = next(
                    (t for t in s.translations if t.language_code == lang),
                    s.translations[0],
                )
                text = translation.text
            # Clean text of newlines for stability
            clean_text = text.replace("\n", " ").replace("\r", " ").strip()
            lines.append(clean_text[:80])  # PQMethod limit is often 80 chars
        return "\n".join(lines)

    @staticmethod
    def _generate_ans(study: Study, participants: list[Participant]) -> str:
        """Generates .ans file (PQMethod project configuration)."""
        # Very specific legacy format
        # Line 1: Title (up to 80 chars)
        title = study.slug[:80]
        # Line 2: N_items (3), Format (3? usually 0), N_Participants (3)
        n_items = str(len(study.statements)).rjust(3)
        n_p = str(len(participants)).rjust(3)

        return f"{title}\n{n_items}  0{n_p}\n"

    @staticmethod
    def _generate_dat(
        study: Study,
        participants: list[Participant],
        sorted_statements: list[Statement],
    ) -> str:
        """Generates .dat file content (Fixed width data matrix)."""
        # Line 1: StudyName (8), N_Users(3), N_Items(3)
        # PQMethod is extremely rigid about these widths
        study_id = study.slug[:8].ljust(8)
        n_users = str(len(participants)).rjust(3)
        n_items = str(len(study.statements)).rjust(3)

        header = f"{study_id}{n_users}{n_items}\n"

        body_lines = []
        for i, p in enumerate(participants):
            # PID (8 chars)
            pid = str(i + 1).rjust(7) + " "  # 8 total

            # Mapping
            scores_map = {
                entry.statement_id: entry.grid_score for entry in p.qsort_entries
            }

            # PQMethod often expects 2-digit scores (e.g. " 1", "-1", " 0")
            # or sometimes even more compressed.
            scores_str = ""
            for s in sorted_statements:
                score = scores_map.get(s.id)
                if score is None:
                    logger.warning(
                        "Participant %s missing score for statement %s — defaulting to 0",
                        p.id,
                        s.id,
                    )
                    score = 0
                # We use 2 chars per score
                # If score is positive, add a space. If negative, it has the minus.
                if score >= 0:
                    scores_str += f" {score}"
                else:
                    scores_str += str(score)

            body_lines.append(f"{pid}{scores_str}")

        return header + "\n".join(body_lines)

    @staticmethod
    def _generate_r_script(study: Study) -> str:
        """Generates a dynamic R script for qmethod package."""
        # Calculate actual metadata column count
        presort_fields = study.presort_config or {}
        n_presort = len(presort_fields)
        n_fixed_meta = 11  # Participant_UID through Is_Test_Run
        n_meta = n_fixed_meta + n_presort
        n_items = len(study.statements)

        return f"""# Libre-Q Automatic Analysis Script
# Required: install.packages("qmethod")

library(qmethod)

# 1. Load Data
data <- read.csv("q_data.csv", check.names = FALSE)

# 2. Extract Q-Sorts
# CSV Structure: {n_meta} metadata columns ({n_fixed_meta} fixed + {n_presort} presort)
# Each statement has 5 columns: score, comment, audio_url, audio_duration, audio_size
# We extract only the score columns (every 5th column starting from first statement)

n_meta <- {n_meta}
n_items <- {n_items}

# Extract only score columns: S1, S2, S3, ... (skipping comments and audio metadata)
score_cols <- seq(n_meta + 1, n_meta + (n_items * 5), by = 5)
q_sorts <- data[, score_cols]

# Set row names to participant UIDs
rownames(q_sorts) <- data$Participant_UID

# Set column names to statement codes
statement_cols <- colnames(data)[score_cols]
colnames(q_sorts) <- statement_cols

# 3. Basic Analysis
# Extract 3 factors using varimax rotation (adjust nfactors as needed)
results <- qmethod(q_sorts, nfactors = 3, rotation = "varimax")

# 4. View Summary
summary(results)
plot(results)

# 5. Export Results (uncomment to save)
# write.csv(results$zsc, "factor_z_scores.csv")
# write.csv(results$f_char$characteristics, "factor_characteristics.csv")
# write.csv(results$loa, "factor_loadings.csv")
"""
