"""Service for exporting study results in various formats."""

import csv
import io
import zipfile

from ..models import Participant, Study, Statement


class ExportService:
    """Service for exporting study results."""

    @staticmethod
    def generate_csv(study: Study, participants: list[Participant]) -> str:
        """Generates a CSV string of participant data and Q-sort scores."""
        output = io.StringIO()
        writer = csv.writer(output)

        # 1. Header
        # Get all statement codes for the header, sorted by ID for consistency
        sorted_statements = sorted(study.statements, key=lambda s: s.id)
        statement_codes = [s.code for s in sorted_statements]
        header = [
            "Participant_UID",
            "Confirmation_Code",
            "Language",
            "Status",
            "Submitted_At",
            "IP_Hash",
        ]

        # Add Presort questions
        presort_keys = list(study.presort_config.keys()) if study.presort_config else []
        header.extend([f"Pre_{k}" for k in presort_keys])

        # Add Statement Scores
        header.extend(statement_codes)

        # Add Postsort questions
        postsort_keys = (
            list(study.postsort_config.keys()) if study.postsort_config else []
        )
        header.extend([f"Post_{k}" for k in postsort_keys])

        writer.writerow(header)

        # 2. Rows
        for p in participants:
            row = [
                str(p.session_token),
                p.confirmation_code or "",
                p.language_used,
                p.status.value,
                p.submitted_at.isoformat() if p.submitted_at else "",
                p.ip_address or "",
            ]

            # Presort
            for k in presort_keys:
                row.append(p.presort_answers.get(k, ""))

            # Q-Sort Scores
            # Map statement_id -> grid_score for this participant
            scores_map = {
                entry.statement_id: entry.grid_score for entry in p.qsort_entries
            }
            for s in sorted_statements:
                score = scores_map.get(s.id)
                row.append(str(score) if score is not None else "")

            # Postsort
            for k in postsort_keys:
                row.append(p.postsort_answers.get(k, ""))

            writer.writerow(row)

        return output.getvalue()

    @staticmethod
    def generate_pqmethod_zip(study: Study, participants: list[Participant]) -> bytes:
        """Generates a ZIP containing .dat, .sta, and .ans files for PQMethod."""
        zip_buffer = io.BytesIO()

        # Sort statements for consistency across all files
        sorted_statements = sorted(study.statements, key=lambda s: s.id)

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Generate .sta (Statements)
            sta_content = ExportService._generate_sta(sorted_statements)
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
    def _generate_sta(statements: list[Statement]) -> str:
        """Generates .sta file content (Statement list)."""
        lines = []
        for s in statements:
            # PQMethod expects one statement per line
            text = s.code
            if s.translations:
                # Use first translation or better: use English if available
                text = s.translations[0].text
            # Clean text of newlines for stability
            clean_text = text.replace("\n", " ").replace("\r", " ").strip()
            lines.append(clean_text)
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
                score = scores_map.get(s.id, 0)
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
        return f"""# Open-Q Automatic Analysis Script
# Required: install.packages("qmethod")

library(qmethod)

# 1. Load Data
data <- read.csv("q_data.csv", check.names = FALSE)

# 2. Extract Q-Sorts
# (Assuming statement codes start at column 7)
n_meta <- 6
n_items <- {len(study.statements)}
q_sorts <- data[, (n_meta + 1):(n_meta + n_items)]
rownames(q_sorts) <- data$Participant_UID
colnames(q_sorts) <- colnames(data)[(n_meta + 1):(n_meta + n_items)]

# 3. Basic Analysis
results <- qmethod(q_sorts, nfactors = 3, rotation = "varimax")

# 4. View Summary
summary(results)
plot(results)

# Export results to CSV
# write.csv(results$qsorts, "factor_scores.csv")
"""
