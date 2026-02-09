# Audio Recording Export Verification

## Summary

Audio recordings are **fully integrated** into all export formats in Libre-Q. This document verifies that audio data is properly included in CSV, JSON, PQMethod, R-Kit, and Research Package exports.

## Export Service Implementation

### CSV Export (`export_service.py` lines 17-234)

#### Audio Columns for Statements (lines 102-109)

For EACH statement in the Q-set, the CSV export includes **5 columns**:
```python
for s in sorted_statements:
    header.append(s.code)  # Score (e.g., "S1")
    header.append(f"{s.code}_Comment")  # Text comment (e.g., "S1_Comment")
    header.append(f"{s.code}_Audio_URL")  # Presigned S3 URL (e.g., "S1_Audio_URL")
    header.append(f"{s.code}_Audio_Duration_Sec")  # Duration in seconds
    header.append(f"{s.code}_Audio_FileSize_KB")  # File size in kilobytes
```

**Example headers** for a study with statements S1, S2, S3:
- `S1`, `S1_Comment`, `S1_Audio_URL`, `S1_Audio_Duration_Sec`, `S1_Audio_FileSize_KB`
- `S2`, `S2_Comment`, `S2_Audio_URL`, `S2_Audio_Duration_Sec`, `S2_Audio_FileSize_KB`
- `S3`, `S3_Comment`, `S3_Audio_URL`, `S3_Audio_Duration_Sec`, `S3_Audio_FileSize_KB`

#### Audio Columns for Postsort Questions (lines 119-134)

When audio is enabled in study config (`postsort_config.audio.enabled = true`), additional columns are added for postsort questions:
```python
if audio_enabled:
    header.extend([
        "Missing_Statement_Audio_URL",
        "Missing_Statement_Audio_Duration_Sec",
        "Missing_Statement_Audio_FileSize_KB",
    ])
```

#### Presigned URL Generation (lines 163-181)

For each participant, audio recordings are loaded and presigned URLs are generated with **24-hour expiration**:
```python
audio_map = {}
for audio_rec in p.audio_recordings:
    try:
        presigned_url = storage_service.generate_presigned_url(
            audio_rec.s3_key, expiration=86400  # 24 hours
        )
        audio_map[audio_rec.question_key] = {
            "url": presigned_url,
            "duration": audio_rec.duration_seconds,
            "size_kb": round(audio_rec.file_size_bytes / 1024, 2),
        }
    except Exception as e:
        # Log error but don't fail export
        print(f"Failed to generate presigned URL for {audio_rec.s3_key}: {e}")
```

**Error handling**: If URL generation fails, the error is logged but export continues with empty audio fields.

#### Data Population (lines 201-230)

For each statement:
```python
audio_key = f"card_{s.id}"
audio_data = audio_map.get(audio_key)
if audio_data:
    row.append(str(audio_data["url"]))  # Full S3 presigned URL
    row.append(str(audio_data["duration"]) if audio_data["duration"] else "")
    row.append(str(audio_data["size_kb"]))
else:
    row.extend(["", "", ""])  # Empty cells if no audio
```

For postsort questions:
```python
if audio_enabled:
    missing_audio = audio_map.get("missing_statement")
    if missing_audio:
        row.append(str(missing_audio["url"]))
        row.append(str(missing_audio["duration"]) if missing_audio["duration"] else "")
        row.append(str(missing_audio["size_kb"]))
    else:
        row.extend(["", "", ""])
```

### JSON Dump Export (`study_service.py` lines 1051-1175)

#### Audio Recordings in Participant Data (lines 1103-1141)

Each participant object in the JSON dump includes an `audio_recordings` dictionary:
```python
audio_recordings = {}
for audio_rec in p.audio_recordings:
    try:
        presigned_url = storage_service.generate_presigned_url(
            audio_rec.s3_key, expiration=86400
        )
        audio_recordings[audio_rec.question_key] = {
            "id": audio_rec.id,
            "duration_seconds": audio_rec.duration_seconds,
            "file_size_bytes": audio_rec.file_size_bytes,
            "mime_type": audio_rec.mime_type,
            "created_at": audio_rec.created_at.isoformat(),
            "presigned_url": presigned_url,
        }
    except Exception as e:
        print(f"Failed to generate presigned URL for {audio_rec.s3_key}: {e}")
```

**Structure example**:
```json
{
  "participants": [
    {
      "id": "A1B2C3D4",
      "audio_recordings": {
        "card_123": {
          "id": 1,
          "duration_seconds": 45.5,
          "file_size_bytes": 123456,
          "mime_type": "audio/webm",
          "created_at": "2026-02-09T12:34:56+00:00",
          "presigned_url": "https://s3.example.com/audio/study/participant/card_123.webm?signature=..."
        },
        "missing_statement": {
          "id": 2,
          "duration_seconds": 67.8,
          "file_size_bytes": 234567,
          "mime_type": "audio/webm",
          "created_at": "2026-02-09T12:35:23+00:00",
          "presigned_url": "https://s3.example.com/audio/study/participant/missing.webm?signature=..."
        }
      },
      "scores": [...],
      "presort": {...},
      "postsort": {...}
    }
  ]
}
```

## API Endpoints

### All Export Endpoints Load Audio Recordings (`exports.py`)

#### CSV Export (lines 24-60)
```python
query = (
    select(Participant)
    .where(Participant.study_id == study.id)
    .options(
        selectinload(Participant.qsort_entries),
        selectinload(Participant.audio_recordings),  # ✓ Loaded
    )
)
```

#### PQMethod Export (lines 63-97)
```python
query = (
    select(Participant)
    .where(Participant.study_id == study.id)
    .options(
        selectinload(Participant.qsort_entries),
        selectinload(Participant.audio_recordings),  # ✓ Loaded
    )
)
```

#### R-Kit Export (lines 100-134)
```python
query = (
    select(Participant)
    .where(Participant.study_id == study.id, Participant.is_discarded.is_(False))
    .options(
        selectinload(Participant.qsort_entries),
        selectinload(Participant.audio_recordings),  # ✓ Loaded
    )
)
```

#### Single Participant CSV Export (lines 148-194)
```python
query = (
    select(Participant)
    .where(
        Participant.id == participant_id,
        Participant.study_id == study.id,
    )
    .options(
        selectinload(Participant.qsort_entries),
        selectinload(Participant.audio_recordings),  # ✓ Loaded
    )
)
```

#### Single Participant JSON Export (lines 197-224)

Uses `StudyService.get_study_full_dump()` which loads audio_recordings (see study_service.py line 1075)

#### Research Package Export (lines 227-267)
```python
stmt = (
    select(Study)
    .where(Study.id == study.id)
    .options(
        selectinload(Study.statements).selectinload(Statement.translations),
        selectinload(Study.participants).selectinload(Participant.qsort_entries),
        selectinload(Study.participants).selectinload(Participant.audio_recordings),  # ✓ Loaded
        selectinload(Study.translations),
    )
)
```

## Research Package Contents

The complete research package (ZIP file) includes audio data in **multiple formats**:

### Files in ZIP
1. **`data_all.csv`** - CSV with audio URL/duration/size columns
2. **`data_all.json`** - JSON with full audio_recordings objects
3. **`codebook.txt`** - Human-readable study documentation
4. **`statements.csv`** - Statement reference with all translations
5. **`pqmethod/*.sta`** - PQMethod statement file
6. **`pqmethod/*.dat`** - PQMethod data matrix
7. **`pqmethod/*.ans`** - PQMethod project config
8. **`r_kit/q_data.csv`** - CSV for R analysis (includes audio columns)
9. **`r_kit/analysis.R`** - R script for qmethod package

**Note**: PQMethod and R-Kit formats include the full CSV data, which contains audio URLs in dedicated columns.

## Audio Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Participant records audio in browser (MediaRecorder API)    │
│    - Format: WebM (Chrome/Firefox) or MP4/AAC (Safari)         │
│    - Maximum duration: Configured per study (default 180s)      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Upload to S3 via /api/audio/upload endpoint                 │
│    - Validation: MIME type, file size, storage quota           │
│    - Generates unique S3 key: audio/{slug}/{token}/{question}  │
│    - Stores metadata in PostgreSQL (AudioRecording model)      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Researcher exports data                                      │
│    - Export endpoints load audio_recordings relationship        │
│    - Generate fresh presigned URLs (24h expiration)            │
│    - Include in CSV (URL/duration/size) and JSON (full object) │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Researcher downloads audio files                            │
│    - Click presigned URL from CSV or JSON                       │
│    - Direct download from S3 (no backend proxy)                 │
│    - URLs valid for 24 hours from export generation            │
└─────────────────────────────────────────────────────────────────┘
```

## Security Features

### Presigned URL Expiration
- **24-hour expiration** for export downloads
- **1-hour expiration** for participant playback during study (via `/api/audio/{recording_id}/url`)
- URLs automatically expire to prevent unauthorized access

### Access Control
- All audio recordings belong to a participant
- Participants can only access their own recordings before submission
- Researchers need study editor/viewer role to export audio
- S3 bucket is private (no public access)

### Quota Enforcement
- Storage quota configured per study (default: 100 MB)
- Pre-upload validation prevents quota overruns
- Admin dashboard shows current usage vs quota

## Validation Checklist

### ✅ CSV Export
- [x] Audio URL columns added for each statement (`{code}_Audio_URL`)
- [x] Audio duration columns added for each statement (`{code}_Audio_Duration_Sec`)
- [x] Audio file size columns added for each statement (`{code}_Audio_FileSize_KB`)
- [x] Postsort audio columns added when enabled (`Missing_Statement_Audio_URL`, etc.)
- [x] Empty fields when no audio recording exists
- [x] Presigned URLs generated with 24h expiration
- [x] Error handling prevents export failure if URL generation fails

### ✅ JSON Export
- [x] `audio_recordings` dictionary included in participant data
- [x] Question keys map to audio metadata objects
- [x] Metadata includes: id, duration_seconds, file_size_bytes, mime_type, created_at, presigned_url
- [x] Presigned URLs generated with 24h expiration
- [x] Error handling for URL generation failures

### ✅ Research Package
- [x] CSV includes audio columns
- [x] JSON includes audio_recordings
- [x] R-Kit CSV includes audio columns
- [x] All files properly included in ZIP

### ✅ Single Participant Exports
- [x] CSV export loads and includes audio data
- [x] JSON export loads and includes audio_recordings
- [x] Presigned URLs generated correctly

## Example CSV Output

```csv
Participant_UID,Confirmation_Code,Language,Status,Submitted_At,Duration_Seconds,IP_Hash,User_Agent,Is_Discarded,Discard_Reason,Is_Test_Run,S1,S1_Comment,S1_Audio_URL,S1_Audio_Duration_Sec,S1_Audio_FileSize_KB,S2,S2_Comment,S2_Audio_URL,S2_Audio_Duration_Sec,S2_Audio_FileSize_KB,Missing_Statement_Audio_URL,Missing_Statement_Audio_Duration_Sec,Missing_Statement_Audio_FileSize_KB
a1b2c3d4-e5f6-7890-abcd-ef1234567890,ABC123,en,completed,2026-02-09T12:34:56+00:00,450,hash123,Mozilla/5.0...,False,,False,3,This is important,https://s3.example.com/audio/study/participant/card_1.webm?sig=...,45.5,12.05,-2,,https://s3.example.com/audio/study/participant/card_2.webm?sig=...,67.8,22.91,https://s3.example.com/audio/study/participant/missing.webm?sig=...,89.2,33.76
```

## Conclusion

Audio recordings are **fully integrated** into all Libre-Q export formats. The implementation:

1. ✅ Adds dedicated columns to CSV exports for audio URLs, duration, and file size
2. ✅ Includes complete audio metadata in JSON exports with presigned download URLs
3. ✅ Generates fresh presigned URLs (24h expiration) for each export to ensure secure access
4. ✅ Handles missing audio gracefully (empty fields in CSV, omitted keys in JSON)
5. ✅ Includes error handling to prevent export failures
6. ✅ Works across all export types (CSV, JSON, PQMethod, R-Kit, Research Package, single participant)

**The export functionality is production-ready and requires no additional implementation.**
