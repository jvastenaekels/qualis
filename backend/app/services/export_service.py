"""Service for exporting study results in various formats."""
import csv
import io
import zipfile

from ..models import Participant, Study


class ExportService:
    """Service for exporting study results."""

    @staticmethod
    def generate_csv(study: Study, participants: list[Participant]) -> str:
        """Generates a CSV string of participant data and Q-sort scores."""
        output = io.StringIO()
        writer = csv.writer(output)

        # 1. Header
        # Get all statement codes for the header
        statement_codes = [s.code for s in study.statements]
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
            for s in study.statements:
                row.append(scores_map.get(s.id, ""))

            # Postsort
            for k in postsort_keys:
                row.append(p.postsort_answers.get(k, ""))

            writer.writerow(row)

        return output.getvalue()

    @staticmethod
    def generate_pqmethod_zip(study: Study, participants: list[Participant]) -> bytes:
        """Generates a ZIP containing .dat and .sta files for PQMethod."""
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Generate .sta (Statements)
            sta_content = ExportService._generate_sta(study)
            zip_file.writestr(f"{study.slug}.sta", sta_content)

            # 2. Generate .dat (Data Matrix)
            dat_content = ExportService._generate_dat(study, participants)
            zip_file.writestr(f"{study.slug}.dat", dat_content)

        return zip_buffer.getvalue()

    @staticmethod
    def _generate_sta(study: Study) -> str:
        """Generates .sta file content (Statement list)."""
        lines = []
        for s in study.statements:
            # PQMethod expects at least the text. Using English or first available.
            # We'll use the code and a snippet of text if available.
            text = s.code
            if s.translations:
                text = s.translations[0].text
            lines.append(text)
        return "\n".join(lines)

    @staticmethod
    def _generate_dat(study: Study, participants: list[Participant]) -> str:
        """Generates .dat file content (Fixed width data matrix).

        Header line 1: Study name (8 chars), N participant (3 chars), N statements (3 chars)
        Header line 2: [not strictly standard but often used for column info]
        Rows: 8 chars for PID, then the Q-sort scores in fixed sequence.
        """
        # PQMethod is picky. This is a "simplified" .dat format.
        # Line 1: StudyID (8), N_Users(3), N_Items(3)
        study_id = study.slug[:8].ljust(8)
        n_users = str(len(participants)).rjust(3)
        n_items = str(len(study.statements)).rjust(3)

        header = f"{study_id}{n_users}{n_items}\n"

        body_lines = []
        for i, p in enumerate(participants):
            # PID (8 chars) - using a numeric index or short hash
            pid = str(i + 1).rjust(8)

            # Scores for each statement in study.statements order
            scores_map = {
                entry.statement_id: entry.grid_score for entry in p.qsort_entries
            }
            scores_str = ""
            for s in study.statements:
                score = scores_map.get(s.id, 0)
                # PQMethod usually expects scores like ' 1', ' 0', '-1' (2 chars per score usually)
                # We'll use 3 chars to be safe (space, sign, digit)
                scores_str += str(score).rjust(3)

            body_lines.append(f"{pid}{scores_str}")

        return header + "\n".join(body_lines)
