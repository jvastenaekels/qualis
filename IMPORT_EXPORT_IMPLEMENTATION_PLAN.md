# 📋 Implementation Plan: Import/Export Study Configuration Feature

## Executive Summary

This document outlines the implementation of a robust import/export feature for study configurations in the Q-methodology study designer. The feature will allow researchers to:
- **Export** complete study configurations as JSON files for backup, sharing, and templating
- **Import** previously exported configurations to create new studies or duplicate existing ones
- Support version migration and validation with clear error handling

**Estimated Timeline**: 8-12 days
**Complexity**: Medium-High
**Priority**: High

---

## 🎯 User Stories & Use Cases

### Primary Use Cases

1. **Study Templating**: Researchers want to reuse a study configuration as a template for new studies
2. **Study Backup**: Researchers want to download study configurations for local backup
3. **Study Sharing**: Researchers want to share study designs with colleagues or the research community
4. **Multi-workspace Migration**: Researchers need to move studies between different Open-Q workspaces
5. **Bulk Study Creation**: Researchers want to create multiple studies with similar configurations

### User Journeys

#### Export Flow
```
1. Navigate to Study Designer or Study Settings
2. Click "Export Configuration" button
3. System validates study completeness
4. JSON file downloads automatically with naming: {slug}_config_{date}.json
5. Success notification appears
```

#### Import Flow
```
1. From Study List page, click "Import Study" button
2. Drag & drop or browse for JSON file
3. System validates file format and content
4. Preview screen shows:
   - Study title, description, language(s)
   - Statement count
   - Grid configuration
   - Any validation warnings
5. User enters new unique slug
6. User confirms import
7. New study created in draft state
8. Redirect to study designer
```

---

## 🎨 UX/UI Design Specifications

### 1. Export Button Placement

**Location Options:**
- **Option A (Recommended)**: Add to StudyDesignPage header alongside save status indicator
- **Option B**: Add to GeneralSettingsPage as part of study management actions
- **Option C**: Add to StudyOverviewPage action menu

**Recommended: Option A + C** (both locations for discoverability)

**Visual Design:**
```tsx
<Button variant="outline" className="gap-2">
  <Download className="h-4 w-4" />
  {t('admin.design.export_config', 'Export Configuration')}
</Button>
```

### 2. Import Entry Point

**Location**: Study list page (admin dashboard) alongside "Create Study" button

**Visual Design:**
```tsx
<div className="flex gap-3">
  <Button variant="outline" className="gap-2">
    <Upload className="h-4 w-4" />
    {t('admin.dialogs.import_study.trigger', 'Import Study')}
  </Button>

  <Button className="gap-2">
    <Plus className="h-4 w-4" />
    {t('admin.dialogs.create_study.trigger', 'Create Study')}
  </Button>
</div>
```

### 3. Import Dialog Design

#### Step 1: File Upload
```
┌─────────────────────────────────────────────┐
│ Import Study Configuration            [×]   │
├─────────────────────────────────────────────┤
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │                                       │ │
│  │     📁  Drag & drop JSON file        │ │
│  │          or click to browse          │ │
│  │                                       │ │
│  │  Supported format: .json              │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  Or paste JSON directly:                    │
│  ┌───────────────────────────────────────┐ │
│  │ {                                     │ │
│  │   "slug": "example-study",            │ │
│  │   ...                                 │ │
│  └───────────────────────────────────────┘ │
│                                             │
│                    [Cancel]  [Next →]       │
└─────────────────────────────────────────────┘
```

#### Step 2: Validation & Preview
```
┌─────────────────────────────────────────────┐
│ Import Study Configuration            [×]   │
├─────────────────────────────────────────────┤
│                                             │
│ ✓ Configuration Valid                       │
│                                             │
│ Study Details:                              │
│ • Title: "Climate Change Perspectives"      │
│ • Languages: English, French                │
│ • Statements: 36                            │
│ • Grid: -3 to +3 (7 columns)                │
│                                             │
│ ⚠ Warnings:                                 │
│ • Logo URLs may not be accessible           │
│ • Original slug "climate-study" in use      │
│                                             │
│ New Study Slug: *                           │
│ ┌───────────────────────────────────────┐ │
│ │ climate-study-imported                │ │
│ └───────────────────────────────────────┘ │
│ Must be unique, 3-100 chars, lowercase     │
│                                             │
│                [← Back]  [Create Study]     │
└─────────────────────────────────────────────┘
```

### 4. Confirmation & Success States

**Loading State:**
```tsx
<div className="flex items-center gap-2">
  <Loader2 className="h-4 w-4 animate-spin" />
  {t('admin.import.creating', 'Creating study from configuration...')}
</div>
```

**Success Toast:**
```tsx
toast.success(
  t('admin.import.success', 'Study imported successfully'),
  { description: t('admin.import.success_desc', 'Redirecting to designer...') }
);
```

---

## 🏗️ Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│                                                          │
│  ┌──────────────────┐      ┌──────────────────┐        │
│  │ ExportConfigBtn  │      │ ImportStudyDialog│        │
│  │                  │      │                  │        │
│  │ - Click handler  │      │ - File upload    │        │
│  │ - Blob download  │      │ - JSON paste     │        │
│  │ - Error handling │      │ - Validation UI  │        │
│  └────────┬─────────┘      │ - Slug input     │        │
│           │                └────────┬─────────┘        │
│           │                         │                   │
│  ┌────────▼─────────────────────────▼─────────┐        │
│  │         adminService API Client             │        │
│  │                                             │        │
│  │ - exportStudyConfig(slug)                   │        │
│  │ - validateStudyImport(config)               │        │
│  │ - importStudyConfig({config, new_slug})     │        │
│  └────────────────────┬────────────────────────┘        │
└───────────────────────┼─────────────────────────────────┘
                        │
                        │ HTTP/JSON
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  Backend (FastAPI)                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         /api/admin/studies/*                     │  │
│  │                                                  │  │
│  │  GET  /{slug}/export/config                     │  │
│  │  POST /validate-import                          │  │
│  │  POST /import                                   │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │         study_service.py                         │  │
│  │                                                  │  │
│  │ - get_study_by_slug()                           │  │
│  │ - create_study()                                │  │
│  │ - validate_study_config()                       │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │         PostgreSQL Database                      │  │
│  │                                                  │  │
│  │ - studies                                       │  │
│  │ - study_translations                            │  │
│  │ - statements                                    │  │
│  │ - statement_translations                        │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

#### Export Flow
```
User clicks Export → ExportConfigButton.handleExport()
                   → adminService.exportStudyConfig(slug)
                   → GET /api/admin/studies/{slug}/export/config
                   → Build JSON response (no participant data)
                   → Return JSON with Content-Disposition header
                   → Frontend creates Blob and downloads file
                   → Success toast notification
```

#### Import Flow
```
User uploads file → ImportDialog.onDrop() / handlePasteSubmit()
                  → Parse JSON
                  → adminService.validateStudyImport(config)
                  → POST /api/admin/studies/validate-import
                  → Validate schema, check errors/warnings
                  → Show preview with summary
                  → User enters new slug
                  → adminService.importStudyConfig({config, new_slug})
                  → POST /api/admin/studies/import
                  → Create new study in database
                  → Return new study slug
                  → Invalidate queries, redirect to designer
```

---

## 🔧 Technical Implementation

### Phase 1: Backend API Endpoints

#### 1.1 Export Configuration Endpoint

**File**: `backend/app/routers/admin/studies.py`

```python
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_active_user
from app.models import User
from app.services import study_service

router = APIRouter()

@router.get("/{slug}/export/config")
async def export_study_config(
    slug: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Export study configuration without participant data.
    Returns clean JSON suitable for import.

    Args:
        slug: Study slug identifier
        current_user: Authenticated user
        db: Database session

    Returns:
        JSON configuration with version metadata

    Raises:
        404: Study not found
        403: User doesn't have access to study
    """
    study = study_service.get_study_by_slug(db, slug, current_user.workspace_id)
    if not study:
        raise HTTPException(404, "Study not found")

    # Build export structure
    config = {
        "version": "1.0",  # Schema version for future compatibility
        "exported_at": datetime.utcnow().isoformat(),
        "exported_by": current_user.email,
        "study": {
            "slug": study.slug,  # Can be changed on import
            "state": "draft",  # Always import as draft
            "default_language": study.default_language,
            "show_statement_codes": study.show_statement_codes,
            "randomize_statement_order": study.randomize_statement_order,
            "symmetry_lock": study.symmetry_lock,
            "grid_config": study.grid_config,
            "presort_config": study.presort_config,
            "postsort_config": study.postsort_config,
            "branding": study.branding,
            "translations": [
                {
                    "language_code": t.language_code,
                    "title": t.title,
                    "subtitle": t.subtitle,
                    "description": t.description,
                    "objective": t.objective,
                    "instructions": t.instructions,
                    "condition_of_instruction": t.condition_of_instruction,
                    "consent_title": t.consent_title,
                    "consent_description": t.consent_description,
                    "consent_accept": t.consent_accept,
                    "consent_decline": t.consent_decline,
                    "ui_labels": t.ui_labels,
                    "process_steps": t.process_steps,
                    "methodology_tips": t.methodology_tips,
                    "step_help": t.step_help
                }
                for t in study.translations
            ],
            "statements": [
                {
                    "code": s.code,
                    "translations": [
                        {
                            "language_code": st.language_code,
                            "text": st.text
                        }
                        for st in s.translations
                    ]
                }
                for s in study.statements
            ]
        }
    }

    filename = f"{slug}_config_{datetime.utcnow().strftime('%Y%m%d')}.json"

    return JSONResponse(
        content=config,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
```

#### 1.2 Validation Endpoint

**File**: `backend/app/routers/admin/studies.py`

```python
from typing import Dict, List, Any
from pydantic import BaseModel

class ValidationResult(BaseModel):
    valid: bool
    errors: List[str]
    warnings: List[str]
    summary: Dict[str, Any]

@router.post("/validate-import", response_model=ValidationResult)
async def validate_study_import(
    config: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Validate imported configuration without creating study.
    Returns validation results and warnings.

    Args:
        config: Study configuration JSON
        current_user: Authenticated user
        db: Database session

    Returns:
        ValidationResult with errors, warnings, and summary
    """
    warnings = []
    errors = []

    # Check version
    version = config.get("version")
    if not version:
        errors.append("Missing version field")
    elif version != "1.0":
        errors.append(f"Unsupported version: {version}")

    study_data = config.get("study", {})

    # Validate required fields
    required = ["slug", "translations", "statements", "grid_config"]
    for field in required:
        if field not in study_data:
            errors.append(f"Missing required field: {field}")

    # Check translations
    if "translations" in study_data:
        translations = study_data["translations"]
        if len(translations) == 0:
            errors.append("At least one translation required")

        for i, trans in enumerate(translations):
            required_trans = [
                "language_code", "title", "description",
                "consent_title", "consent_description"
            ]
            for field in required_trans:
                if field not in trans or not trans[field]:
                    errors.append(
                        f"Translation {i+1} missing required field: {field}"
                    )

            # Validate language code
            lang_code = trans.get("language_code", "")
            if lang_code and not re.match(r'^[a-z]{2}$', lang_code):
                errors.append(
                    f"Invalid language code: {lang_code} (must be 2 lowercase letters)"
                )

    # Check statements
    if "statements" in study_data:
        statements = study_data["statements"]
        if len(statements) == 0:
            errors.append("At least one statement required")

        # Check for duplicate codes
        codes = [s.get("code") for s in statements]
        duplicates = [code for code in codes if codes.count(code) > 1]
        if duplicates:
            errors.append(f"Duplicate statement codes: {', '.join(set(duplicates))}")

        # Check statement translations
        for i, stmt in enumerate(statements):
            if "translations" not in stmt or len(stmt["translations"]) == 0:
                errors.append(f"Statement {i+1} missing translations")

    # Check statements vs grid capacity
    if "statements" in study_data and "grid_config" in study_data:
        statement_count = len(study_data["statements"])
        grid_config = study_data["grid_config"]

        if not isinstance(grid_config, list) or len(grid_config) == 0:
            errors.append("Invalid grid_config: must be non-empty array")
        else:
            try:
                grid_capacity = sum(col["capacity"] for col in grid_config)
                if statement_count != grid_capacity:
                    errors.append(
                        f"Statement count ({statement_count}) doesn't match "
                        f"grid capacity ({grid_capacity})"
                    )
            except (KeyError, TypeError) as e:
                errors.append(f"Invalid grid_config structure: {str(e)}")

    # Check for external resources that may not import
    if "branding" in study_data:
        branding = study_data["branding"]
        if "logo_url" in branding and branding["logo_url"]:
            if branding["logo_url"].startswith("http"):
                warnings.append(
                    "Logo URL references external resource - may not be accessible"
                )

        if "partners" in branding:
            for partner in branding["partners"]:
                if partner.get("logo_url", "").startswith("http"):
                    warnings.append(
                        f"Partner '{partner.get('name', 'Unknown')}' logo references external resource"
                    )

    # Check presort/postsort configs
    if "presort_config" in study_data:
        if not isinstance(study_data["presort_config"], (dict, type(None))):
            errors.append("Invalid presort_config: must be object or null")

    if "postsort_config" in study_data:
        if not isinstance(study_data["postsort_config"], (dict, type(None))):
            errors.append("Invalid postsort_config: must be object or null")

    # Extract summary info
    summary = {}
    if not errors:  # Only build summary if no critical errors
        try:
            summary = {
                "title": study_data.get("translations", [{}])[0].get("title", "Unknown"),
                "languages": [
                    t["language_code"]
                    for t in study_data.get("translations", [])
                ],
                "statement_count": len(study_data.get("statements", [])),
                "grid_range": _get_grid_range(study_data.get("grid_config", [])),
                "has_presort": bool(study_data.get("presort_config")),
                "has_postsort": bool(study_data.get("postsort_config")),
            }
        except Exception as e:
            errors.append(f"Error building summary: {str(e)}")

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary=summary
    )

def _get_grid_range(grid_config: list) -> str:
    """Helper to get grid score range as string"""
    if not grid_config:
        return "Unknown"
    try:
        scores = [col["score"] for col in grid_config]
        return f"{min(scores)} to {max(scores)}"
    except (KeyError, ValueError):
        return "Invalid"
```

#### 1.3 Import Endpoint

**File**: `backend/app/routers/admin/studies.py`

```python
import re
from pydantic import BaseModel, validator, ValidationError
from app.schemas import StudyCreate

class StudyImportRequest(BaseModel):
    config: dict
    new_slug: str

    @validator('new_slug')
    def validate_slug(cls, v):
        if not re.match(r'^[a-z0-9-]{3,100}$', v):
            raise ValueError(
                'Slug must be 3-100 characters, lowercase letters, numbers, and hyphens only'
            )
        return v

class StudyImportResponse(BaseModel):
    slug: str
    message: str

@router.post("/import", response_model=StudyImportResponse)
async def import_study_config(
    request: StudyImportRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Import study configuration from exported JSON.
    Creates a new study in draft state.

    Args:
        request: Import request with config and new slug
        current_user: Authenticated user
        db: Database session

    Returns:
        StudyImportResponse with new study slug

    Raises:
        400: Invalid configuration version
        409: Slug already exists
        422: Validation error in configuration
    """
    config = request.config

    # Validate version compatibility
    version = config.get("version")
    if version != "1.0":
        raise HTTPException(
            400,
            f"Unsupported configuration version: {version}. Expected: 1.0"
        )

    # Check slug uniqueness
    existing = study_service.get_study_by_slug(
        db, request.new_slug, current_user.workspace_id
    )
    if existing:
        raise HTTPException(
            409,
            f"A study with slug '{request.new_slug}' already exists in this workspace"
        )

    study_data = config["study"].copy()

    # Override with new slug and ensure draft state
    study_data["slug"] = request.new_slug
    study_data["state"] = "draft"

    # Remove fields that shouldn't be imported
    fields_to_remove = [
        "id", "created_at", "updated_at",
        "start_date", "end_date", "workspace_id"
    ]
    for field in fields_to_remove:
        study_data.pop(field, None)

    # Validate against schema
    try:
        study_create = StudyCreate(**study_data)
    except ValidationError as e:
        # Format validation errors nicely
        error_details = []
        for error in e.errors():
            field = ".".join(str(x) for x in error["loc"])
            msg = error["msg"]
            error_details.append(f"{field}: {msg}")

        raise HTTPException(
            422,
            detail={
                "message": "Invalid configuration structure",
                "errors": error_details
            }
        )

    # Create study
    try:
        new_study = study_service.create_study(
            db,
            study_create,
            current_user.workspace_id,
            current_user.id
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to create study: {str(e)}")

    return StudyImportResponse(
        slug=new_study.slug,
        message="Study imported successfully"
    )
```

### Phase 2: Frontend Components

#### 2.1 Export Configuration Button

**File**: `frontend/src/components/admin/designer/ExportConfigButton.tsx`

```tsx
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminService } from '@/api/admin';

interface ExportConfigButtonProps {
  studySlug: string;
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}

/**
 * Button component to export study configuration as JSON file
 *
 * @param studySlug - The slug of the study to export
 * @param variant - Button variant style
 * @param className - Additional CSS classes
 */
export function ExportConfigButton({
  studySlug,
  variant = 'outline',
  className
}: ExportConfigButtonProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Call export API
      const response = await adminService.exportStudyConfig(studySlug);

      // Create blob and download
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${studySlug}_config_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(
        t('admin.export.config_success', 'Configuration exported successfully')
      );
    } catch (error: any) {
      console.error('Export failed:', error);
      toast.error(
        t('admin.export.config_error', 'Failed to export configuration'),
        { description: error.message }
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant={variant}
      className={className}
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {t('admin.export.exporting', 'Exporting...')}
        </>
      ) : (
        <>
          <Download className="h-4 w-4 mr-2" />
          {t('admin.export.config', 'Export Configuration')}
        </>
      )}
    </Button>
  );
}
```

#### 2.2 Import Study Dialog

**File**: `frontend/src/components/admin/ImportStudyDialog.tsx`

```tsx
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

import { adminService } from '@/api/admin';
import { cn } from '@/lib/utils';

interface ImportStudyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'validate' | 'creating';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    title: string;
    languages: string[];
    statement_count: number;
    grid_range: string;
    has_presort: boolean;
    has_postsort: boolean;
  };
}

/**
 * Dialog component for importing study configurations
 * Supports file upload or paste JSON, with validation and preview
 */
export function ImportStudyDialog({ open, onOpenChange }: ImportStudyDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('upload');
  const [config, setConfig] = useState<any>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [newSlug, setNewSlug] = useState('');
  const [uploadMethod, setUploadMethod] = useState<'file' | 'paste'>('file');
  const [pastedJson, setPastedJson] = useState('');

  // File dropzone handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        await handleConfigLoaded(json);
      } catch (error: any) {
        toast.error(
          t('admin.import.invalid_json', 'Invalid JSON file'),
          { description: error.message }
        );
      }
    };
    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    multiple: false,
  });

  // Handle pasted JSON
  const handlePasteSubmit = async () => {
    try {
      const json = JSON.parse(pastedJson);
      await handleConfigLoaded(json);
    } catch (error: any) {
      toast.error(
        t('admin.import.invalid_json', 'Invalid JSON'),
        { description: error.message }
      );
    }
  };

  // Validate configuration
  const handleConfigLoaded = async (configData: any) => {
    try {
      setStep('validate');
      setConfig(configData);

      const result = await adminService.validateStudyImport(configData);
      setValidation(result.data);

      // Suggest a slug based on original
      const originalSlug = configData.study?.slug || 'imported-study';
      const timestamp = Date.now().toString().slice(-6);
      setNewSlug(`${originalSlug}-${timestamp}`);
    } catch (error: any) {
      toast.error(
        t('admin.import.validation_failed', 'Validation failed'),
        { description: error.message }
      );
      setStep('upload');
    }
  };

  // Create study from config
  const handleImport = async () => {
    if (!validation?.valid || !newSlug) return;

    try {
      setStep('creating');

      const result = await adminService.importStudyConfig({
        config,
        new_slug: newSlug,
      });

      toast.success(
        t('admin.import.success', 'Study imported successfully'),
        { description: t('admin.import.redirecting', 'Opening study designer...') }
      );

      // Invalidate studies query
      queryClient.invalidateQueries(['studies']);

      // Close dialog and navigate
      onOpenChange(false);
      navigate(`/admin/studies/${result.data.slug}/design`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message;
      toast.error(
        t('admin.import.failed', 'Import failed'),
        { description: typeof errorMsg === 'string' ? errorMsg : 'Unknown error' }
      );
      setStep('validate');
    }
  };

  // Reset on close
  const handleClose = () => {
    setStep('upload');
    setConfig(null);
    setValidation(null);
    setNewSlug('');
    setPastedJson('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {t('admin.import.title', 'Import Study Configuration')}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && t('admin.import.upload_desc', 'Upload a previously exported study configuration file')}
            {step === 'validate' && t('admin.import.validate_desc', 'Review configuration and provide a unique slug')}
            {step === 'creating' && t('admin.import.creating_desc', 'Creating study...')}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <Tabs value={uploadMethod} onValueChange={(v) => setUploadMethod(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file">
                  {t('admin.import.file_upload', 'File Upload')}
                </TabsTrigger>
                <TabsTrigger value="paste">
                  {t('admin.import.paste_json', 'Paste JSON')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="mt-4">
                <div
                  {...getRootProps()}
                  className={cn(
                    'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
                    isDragActive
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-300 hover:border-indigo-400'
                  )}
                >
                  <input {...getInputProps()} />
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {isDragActive
                      ? t('admin.import.drop_here', 'Drop file here')
                      : t('admin.import.drag_drop', 'Drag & drop JSON file or click to browse')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('admin.import.supported', 'Supported format: .json')}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="paste" className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="json-paste">
                    {t('admin.import.paste_label', 'Paste JSON configuration')}
                  </Label>
                  <Textarea
                    id="json-paste"
                    placeholder='{"version": "1.0", "study": {...}}'
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    className="font-mono text-xs h-64 mt-2"
                  />
                </div>
                <Button onClick={handlePasteSubmit} className="w-full">
                  {t('admin.import.validate', 'Validate & Continue')}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Step 2: Validation & Preview */}
        {step === 'validate' && validation && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Validation Status */}
            {validation.valid ? (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {t('admin.import.valid', 'Configuration is valid')}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('admin.import.invalid', 'Configuration has errors')}
                </AlertDescription>
              </Alert>
            )}

            {/* Errors */}
            {validation.errors.length > 0 && (
              <div className="space-y-2">
                <Label className="text-red-600 font-semibold">
                  {t('admin.import.errors', 'Errors')}:
                </Label>
                <ul className="text-sm space-y-1">
                  {validation.errors.map((error, i) => (
                    <li key={i} className="text-red-600 flex items-start gap-2">
                      <span className="mt-1">•</span>
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {validation.warnings.length > 0 && (
              <div className="space-y-2">
                <Label className="text-amber-600 font-semibold">
                  {t('admin.import.warnings', 'Warnings')}:
                </Label>
                <ul className="text-sm space-y-1">
                  {validation.warnings.map((warning, i) => (
                    <li key={i} className="text-amber-600 flex items-start gap-2">
                      <span className="mt-1">⚠</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary */}
            {validation.valid && (
              <>
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                  <h4 className="font-semibold text-sm">
                    {t('admin.import.summary', 'Study Summary')}
                  </h4>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500 text-xs uppercase tracking-wide">
                        {t('admin.import.title_field', 'Title')}
                      </dt>
                      <dd className="font-medium mt-1">{validation.summary.title}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase tracking-wide">
                        {t('admin.import.languages', 'Languages')}
                      </dt>
                      <dd className="font-medium mt-1 flex gap-1 flex-wrap">
                        {validation.summary.languages.map(lang => (
                          <Badge key={lang} variant="secondary" className="text-xs">
                            {lang}
                          </Badge>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase tracking-wide">
                        {t('admin.import.statements', 'Statements')}
                      </dt>
                      <dd className="font-medium mt-1">{validation.summary.statement_count}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase tracking-wide">
                        {t('admin.import.grid', 'Grid Range')}
                      </dt>
                      <dd className="font-medium mt-1">{validation.summary.grid_range}</dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-slug">
                    {t('admin.import.new_slug', 'New Study Slug')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="new-slug"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
                    placeholder="my-study"
                    pattern="[a-z0-9-]{3,100}"
                  />
                  <p className="text-xs text-gray-500">
                    {t('admin.import.slug_help', 'Must be unique, 3-100 characters, lowercase letters, numbers, and hyphens only')}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3: Creating */}
        {step === 'creating' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
            <p className="text-sm text-gray-600">
              {t('admin.import.creating', 'Creating study from configuration...')}
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="ghost" onClick={handleClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
          )}
          {step === 'validate' && (
            <>
              <Button variant="ghost" onClick={() => setStep('upload')}>
                {t('common.back', 'Back')}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!validation?.valid || !newSlug}
              >
                {t('admin.import.create_study', 'Create Study')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### 2.3 API Service Methods

**File**: `frontend/src/api/admin.ts`

```typescript
// Add to existing adminService

export const adminService = {
  // ... existing methods ...

  /**
   * Export study configuration as JSON
   * @param slug - Study slug identifier
   * @returns Study configuration JSON
   */
  async exportStudyConfig(slug: string) {
    return apiClient.get(`/api/admin/studies/${slug}/export/config`, {
      responseType: 'json',
    });
  },

  /**
   * Validate imported study configuration
   * @param config - Study configuration object
   * @returns Validation result with errors and warnings
   */
  async validateStudyImport(config: any) {
    return apiClient.post('/api/admin/studies/validate-import', config);
  },

  /**
   * Import study configuration and create new study
   * @param data - Import request with config and new slug
   * @returns Created study slug
   */
  async importStudyConfig(data: { config: any; new_slug: string }) {
    return apiClient.post('/api/admin/studies/import', data);
  },
};
```

### Phase 3: Integration

#### 3.1 Add Export to Study Designer

**File**: `frontend/src/pages/admin/StudyDesignPage.tsx`

```tsx
// Add import at top
import { ExportConfigButton } from '@/components/admin/designer/ExportConfigButton';

// In the header section (find where SyncStatusIndicator is), add:
<div className="flex items-center gap-3">
  <SyncStatusIndicator />
  <ExportConfigButton studySlug={study.slug} />
</div>
```

#### 3.2 Add Import to Study List Page

**File**: Locate the study list page (likely `StudyOverviewPage.tsx` or similar)

```tsx
// Add imports
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { ImportStudyDialog } from '@/components/admin/ImportStudyDialog';

// Add state
const [importDialogOpen, setImportDialogOpen] = useState(false);

// In the actions area (where "Create Study" button is):
<div className="flex gap-3">
  <Button
    variant="outline"
    onClick={() => setImportDialogOpen(true)}
    className="gap-2"
  >
    <Upload className="h-4 w-4" />
    {t('admin.import.trigger', 'Import Study')}
  </Button>

  <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
    <Plus className="h-4 w-4" />
    {t('admin.dialogs.create_study.trigger', 'Create Study')}
  </Button>
</div>

<ImportStudyDialog
  open={importDialogOpen}
  onOpenChange={setImportDialogOpen}
/>
```

### Phase 4: Internationalization

**File**: `frontend/public/locales/en/translation.json`

Add to existing structure:

```json
{
  "admin": {
    "export": {
      "config": "Export Configuration",
      "exporting": "Exporting...",
      "config_success": "Configuration exported successfully",
      "config_error": "Failed to export configuration"
    },
    "import": {
      "title": "Import Study Configuration",
      "trigger": "Import Study",
      "upload_desc": "Upload a previously exported study configuration file",
      "validate_desc": "Review configuration and provide a unique slug",
      "creating_desc": "Creating study...",
      "file_upload": "File Upload",
      "paste_json": "Paste JSON",
      "drag_drop": "Drag & drop JSON file or click to browse",
      "drop_here": "Drop file here",
      "supported": "Supported format: .json",
      "paste_label": "Paste JSON configuration",
      "validate": "Validate & Continue",
      "valid": "Configuration is valid",
      "invalid": "Configuration has errors",
      "errors": "Errors",
      "warnings": "Warnings",
      "summary": "Study Summary",
      "title_field": "Title",
      "languages": "Languages",
      "statements": "Statements",
      "grid": "Grid Range",
      "new_slug": "New Study Slug",
      "slug_help": "Must be unique, 3-100 characters, lowercase letters, numbers, and hyphens only",
      "create_study": "Create Study",
      "creating": "Creating study from configuration...",
      "success": "Study imported successfully",
      "redirecting": "Opening study designer...",
      "failed": "Import failed",
      "invalid_json": "Invalid JSON",
      "validation_failed": "Validation failed"
    }
  }
}
```

**File**: `frontend/public/locales/fr/translation.json`

```json
{
  "admin": {
    "export": {
      "config": "Exporter la configuration",
      "exporting": "Export en cours...",
      "config_success": "Configuration exportée avec succès",
      "config_error": "Échec de l'export de la configuration"
    },
    "import": {
      "title": "Importer une configuration d'étude",
      "trigger": "Importer une étude",
      "upload_desc": "Téléchargez un fichier de configuration d'étude précédemment exporté",
      "validate_desc": "Examinez la configuration et fournissez un slug unique",
      "creating_desc": "Création de l'étude...",
      "file_upload": "Téléchargement de fichier",
      "paste_json": "Coller JSON",
      "drag_drop": "Glissez-déposez un fichier JSON ou cliquez pour parcourir",
      "drop_here": "Déposez le fichier ici",
      "supported": "Format pris en charge : .json",
      "paste_label": "Collez la configuration JSON",
      "validate": "Valider et continuer",
      "valid": "La configuration est valide",
      "invalid": "La configuration contient des erreurs",
      "errors": "Erreurs",
      "warnings": "Avertissements",
      "summary": "Résumé de l'étude",
      "title_field": "Titre",
      "languages": "Langues",
      "statements": "Énoncés",
      "grid": "Plage de grille",
      "new_slug": "Nouveau slug d'étude",
      "slug_help": "Doit être unique, 3-100 caractères, lettres minuscules, chiffres et tirets uniquement",
      "create_study": "Créer l'étude",
      "creating": "Création de l'étude à partir de la configuration...",
      "success": "Étude importée avec succès",
      "redirecting": "Ouverture du concepteur d'étude...",
      "failed": "Échec de l'import",
      "invalid_json": "JSON invalide",
      "validation_failed": "Échec de la validation"
    }
  }
}
```

**File**: `frontend/public/locales/fi/translation.json`

```json
{
  "admin": {
    "export": {
      "config": "Vie asetukset",
      "exporting": "Viedään...",
      "config_success": "Asetukset viety onnistuneesti",
      "config_error": "Asetusten vienti epäonnistui"
    },
    "import": {
      "title": "Tuo tutkimusasetukset",
      "trigger": "Tuo tutkimus",
      "upload_desc": "Lataa aiemmin viety tutkimusasetustiedosto",
      "validate_desc": "Tarkista asetukset ja anna yksilöllinen tunniste",
      "creating_desc": "Luodaan tutkimusta...",
      "file_upload": "Tiedoston lataus",
      "paste_json": "Liitä JSON",
      "drag_drop": "Vedä ja pudota JSON-tiedosto tai klikkaa selataksesi",
      "drop_here": "Pudota tiedosto tähän",
      "supported": "Tuettu muoto: .json",
      "paste_label": "Liitä JSON-asetukset",
      "validate": "Vahvista ja jatka",
      "valid": "Asetukset ovat kelvollisia",
      "invalid": "Asetuksissa on virheitä",
      "errors": "Virheet",
      "warnings": "Varoitukset",
      "summary": "Tutkimuksen yhteenveto",
      "title_field": "Otsikko",
      "languages": "Kielet",
      "statements": "Väittämät",
      "grid": "Ruudukon alue",
      "new_slug": "Uusi tutkimustunniste",
      "slug_help": "Täytyy olla ainutlaatuinen, 3-100 merkkiä, pieniä kirjaimia, numeroita ja viivoja vain",
      "create_study": "Luo tutkimus",
      "creating": "Luodaan tutkimusta asetuksista...",
      "success": "Tutkimus tuotu onnistuneesti",
      "redirecting": "Avataan tutkimussuunnittelija...",
      "failed": "Tuonti epäonnistui",
      "invalid_json": "Virheellinen JSON",
      "validation_failed": "Vahvistus epäonnistui"
    }
  }
}
```

### Phase 5: Dependencies

**File**: `frontend/package.json`

Ensure `react-dropzone` is installed:

```bash
npm install react-dropzone
```

Or add to package.json:

```json
{
  "dependencies": {
    "react-dropzone": "^14.2.3"
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests

#### Backend Tests

**File**: `backend/tests/test_import_export.py`

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_export_config_success():
    """Test successful config export"""
    response = client.get("/api/admin/studies/test-study/export/config")
    assert response.status_code == 200
    assert "version" in response.json()
    assert "study" in response.json()

def test_export_config_not_found():
    """Test export with non-existent study"""
    response = client.get("/api/admin/studies/nonexistent/export/config")
    assert response.status_code == 404

def test_validate_import_valid():
    """Test validation with valid config"""
    valid_config = {
        "version": "1.0",
        "study": {
            "slug": "test",
            "translations": [{"language_code": "en", "title": "Test"}],
            "statements": [{"code": "S1", "translations": []}],
            "grid_config": [{"score": 0, "capacity": 1}]
        }
    }
    response = client.post("/api/admin/studies/validate-import", json=valid_config)
    assert response.status_code == 200
    assert response.json()["valid"] is True

def test_validate_import_missing_version():
    """Test validation with missing version"""
    config = {"study": {}}
    response = client.post("/api/admin/studies/validate-import", json=config)
    assert response.status_code == 200
    result = response.json()
    assert result["valid"] is False
    assert any("version" in error.lower() for error in result["errors"])

def test_import_study_success():
    """Test successful study import"""
    config = load_valid_config()
    request = {"config": config, "new_slug": "imported-study"}
    response = client.post("/api/admin/studies/import", json=request)
    assert response.status_code == 200
    assert response.json()["slug"] == "imported-study"

def test_import_study_duplicate_slug():
    """Test import with existing slug"""
    config = load_valid_config()
    request = {"config": config, "new_slug": "existing-study"}
    response = client.post("/api/admin/studies/import", json=request)
    assert response.status_code == 409

def test_import_study_invalid_slug():
    """Test import with invalid slug format"""
    config = load_valid_config()
    request = {"config": config, "new_slug": "Invalid_Slug!"}
    response = client.post("/api/admin/studies/import", json=request)
    assert response.status_code == 422
```

#### Frontend Tests

**File**: `frontend/src/components/admin/__tests__/ExportConfigButton.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportConfigButton } from '../designer/ExportConfigButton';
import { adminService } from '@/api/admin';

jest.mock('@/api/admin');

describe('ExportConfigButton', () => {
  it('renders export button', () => {
    render(<ExportConfigButton studySlug="test-study" />);
    expect(screen.getByText(/export configuration/i)).toBeInTheDocument();
  });

  it('downloads file on success', async () => {
    const mockData = { version: '1.0', study: {} };
    (adminService.exportStudyConfig as jest.Mock).mockResolvedValue({ data: mockData });

    render(<ExportConfigButton studySlug="test-study" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(adminService.exportStudyConfig).toHaveBeenCalledWith('test-study');
    });
  });

  it('shows error on failure', async () => {
    (adminService.exportStudyConfig as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<ExportConfigButton studySlug="test-study" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText(/failed to export/i)).toBeInTheDocument();
    });
  });
});
```

### Integration Tests

1. **Export → Import Round Trip**:
   - Export existing study
   - Import with new slug
   - Verify all data preserved

2. **Minimal Configuration**:
   - Export study with only required fields
   - Import successfully

3. **Full Configuration**:
   - Export study with all optional fields
   - Verify complete data structure

4. **Multi-language Study**:
   - Export study with EN, FR, FI translations
   - Verify all languages preserved

5. **External Resources**:
   - Export study with HTTP logo URLs
   - Verify warnings displayed during import

### E2E Tests (Playwright/Cypress)

**File**: `e2e/import-export.spec.ts`

```typescript
test('export and import study workflow', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Navigate to study designer
  await page.goto('/admin/studies/test-study/design');

  // Export configuration
  await page.click('text=Export Configuration');
  const download = await page.waitForEvent('download');
  const path = await download.path();
  expect(path).toBeTruthy();

  // Navigate to study list
  await page.goto('/admin/studies');

  // Import study
  await page.click('text=Import Study');
  await page.setInputFiles('input[type="file"]', path);

  // Wait for validation
  await page.waitForSelector('text=Configuration is valid');

  // Enter new slug
  await page.fill('[name="new-slug"]', 'imported-test-study');

  // Create study
  await page.click('text=Create Study');

  // Verify redirect to designer
  await page.waitForURL('**/admin/studies/imported-test-study/design');
  expect(page.url()).toContain('imported-test-study');
});
```

---

## ⚠️ Edge Cases & Error Handling

### Export Errors

| Error | Status | User Message |
|-------|--------|--------------|
| Study not found | 404 | "Study not found" |
| No permission | 403 | "You don't have access to this study" |
| Server error | 500 | "Failed to export configuration. Please try again." |

### Import Errors

| Error | Status | User Message | Solution |
|-------|--------|--------------|----------|
| Invalid JSON syntax | 400 | "Invalid JSON format" | Show parsing error details |
| Missing version field | 422 | "Configuration missing version field" | Require version 1.0 |
| Unsupported version | 400 | "Version 2.0 not supported. Expected 1.0" | Migration guide link |
| Missing required field | 422 | "Missing required field: translations" | List all missing fields |
| Slug already exists | 409 | "Slug 'test-study' already exists" | Prompt for different slug |
| Invalid slug format | 422 | "Slug must be 3-100 chars, lowercase" | Show format requirements |
| Grid capacity mismatch | 422 | "Statement count (36) ≠ grid capacity (40)" | Show expected vs actual |
| Invalid language code | 422 | "Invalid language code: 'eng'" | Must be 2-letter code |
| Duplicate statement codes | 422 | "Duplicate codes: S1, S2" | List duplicates |

### Warnings (Non-blocking)

| Warning | Trigger | User Message |
|---------|---------|--------------|
| External logo URL | logo_url starts with http | "Logo URL may not be accessible after import" |
| External partner logo | partners[].logo_url starts with http | "Partner 'X' logo may not be accessible" |
| Original slug in use | config.study.slug exists | "Original slug in use, please provide new one" |

### UX Considerations

1. **File Size Limits**:
   - Max file size: 10MB
   - Show progress for large files

2. **Browser Compatibility**:
   - FileReader API (IE11+)
   - Blob download (all modern browsers)

3. **Mobile Support**:
   - File picker works on iOS/Android
   - Paste JSON alternative for mobile

4. **Slow Network**:
   - Show spinner during upload/validation
   - Timeout after 30 seconds

5. **Failed Imports**:
   - Don't create orphaned database records
   - Transaction rollback on error

6. **Data Loss Prevention**:
   - Confirm before leaving import dialog
   - Save uploaded config to localStorage

---

## 🚀 Implementation Roadmap

### Phase 1: Backend Foundation (Days 1-3)

**Day 1: Export Endpoint**
- [ ] Create `/export/config` endpoint
- [ ] Build JSON response structure
- [ ] Add version metadata
- [ ] Test with curl/Postman
- [ ] Write unit tests

**Day 2: Validation Endpoint**
- [ ] Create `/validate-import` endpoint
- [ ] Implement all validation rules
- [ ] Test error cases
- [ ] Write unit tests

**Day 3: Import Endpoint**
- [ ] Create `/import` endpoint
- [ ] Implement study creation logic
- [ ] Add slug uniqueness check
- [ ] Test end-to-end with Postman
- [ ] Write unit tests

### Phase 2: Frontend Components (Days 4-7)

**Day 4: Export Button**
- [ ] Create ExportConfigButton component
- [ ] Wire up API call
- [ ] Implement blob download
- [ ] Add loading states
- [ ] Test in browser

**Day 5-6: Import Dialog**
- [ ] Create ImportStudyDialog component
- [ ] Implement file upload (drag & drop)
- [ ] Implement paste JSON tab
- [ ] Add validation display
- [ ] Add slug input
- [ ] Style with Tailwind

**Day 7: API Integration**
- [ ] Add adminService methods
- [ ] Wire up dialog to API
- [ ] Implement error handling
- [ ] Add success redirects
- [ ] Test error scenarios

### Phase 3: Integration (Days 8-9)

**Day 8: Designer Integration**
- [ ] Add export button to StudyDesignPage
- [ ] Add export button to GeneralSettingsPage
- [ ] Test from both locations
- [ ] Verify auto-save doesn't conflict

**Day 9: Study List Integration**
- [ ] Add import button to study list
- [ ] Test dialog open/close
- [ ] Test complete import flow
- [ ] Verify query invalidation

### Phase 4: i18n & Polish (Days 10-11)

**Day 10: Translations**
- [ ] Add English translations
- [ ] Add French translations
- [ ] Add Finnish translations
- [ ] Test language switching
- [ ] Verify all strings translated

**Day 11: Polish & Accessibility**
- [ ] Improve error messages
- [ ] Add keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Optimize loading states
- [ ] Add helpful tooltips

### Phase 5: Testing & Deployment (Days 12-14)

**Day 12: Testing**
- [ ] Write E2E tests
- [ ] Test all error scenarios
- [ ] Test on different browsers
- [ ] Test on mobile devices
- [ ] Fix bugs

**Day 13: Documentation**
- [ ] Write user guide
- [ ] Update API documentation
- [ ] Add inline code comments
- [ ] Create demo video

**Day 14: Deployment**
- [ ] Code review
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production
- [ ] Monitor for issues

---

## 📊 Success Metrics

### Performance Metrics
- Export response time < 2 seconds (for 100-statement study)
- Import validation < 1 second
- Import creation < 5 seconds
- File download initiates within 500ms

### Quality Metrics
- Import success rate > 95%
- Export-import round-trip accuracy: 100% for valid configs
- Zero data loss incidents
- Error messages clarity score > 4/5 (user survey)

### User Metrics
- Feature adoption rate > 30% within first month
- Support tickets < 5% of imports
- User satisfaction score > 4/5
- Time to import study < 2 minutes (including file upload)

---

## 🔒 Security Considerations

### File Upload Security

1. **File Validation**:
   - Accept only `.json` MIME type
   - Validate file extension
   - Limit file size to 10MB
   - Parse JSON before processing

2. **Input Sanitization**:
   - Validate all string fields
   - Escape HTML in text content
   - Prevent XSS in imported markdown
   - SQL injection protection (via ORM)

3. **Authorization**:
   - Verify user workspace membership
   - Check study access permissions
   - Rate limit import attempts
   - Log all import/export operations

### Data Privacy

1. **Participant Data**:
   - **Never** export participant responses in config
   - Only export study structure/content
   - Separate endpoint for data export (existing `/dump`)

2. **Workspace Isolation**:
   - Imported studies belong to current workspace
   - Cannot import into other workspaces
   - No cross-workspace slug conflicts

### Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/import")
@limiter.limit("10/hour")  # Max 10 imports per hour per user
async def import_study_config(...):
    ...
```

---

## 📝 Documentation

### User Documentation

**Help Center Article: "Importing and Exporting Studies"**

```markdown
# Importing and Exporting Study Configurations

## Exporting a Study

1. Open your study in the designer
2. Click **Export Configuration** button in the header
3. A JSON file will download to your computer
4. Save this file for backup or sharing

## Importing a Study

1. From the study list, click **Import Study**
2. Drag & drop your JSON file or paste the content
3. Review the validation results
4. Enter a unique slug for the new study
5. Click **Create Study**
6. You'll be redirected to the study designer

## Common Issues

**"Slug already exists"**
- Choose a different slug name

**"Grid capacity mismatch"**
- The exported study has inconsistent configuration
- Contact support with the file

**"Logo URLs may not be accessible"**
- This is just a warning
- Re-upload logos after import if needed
```

### API Documentation

**OpenAPI Spec Addition**:

```yaml
paths:
  /api/admin/studies/{slug}/export/config:
    get:
      summary: Export study configuration
      description: Downloads study configuration as JSON (no participant data)
      parameters:
        - name: slug
          in: path
          required: true
          schema:
            type: string
      responses:
        200:
          description: Configuration JSON
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StudyConfig'
        404:
          description: Study not found

  /api/admin/studies/validate-import:
    post:
      summary: Validate import configuration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/StudyConfig'
      responses:
        200:
          description: Validation result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ValidationResult'

  /api/admin/studies/import:
    post:
      summary: Import study from configuration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                config:
                  $ref: '#/components/schemas/StudyConfig'
                new_slug:
                  type: string
                  pattern: ^[a-z0-9-]{3,100}$
      responses:
        200:
          description: Study created
        409:
          description: Slug already exists
        422:
          description: Validation error
```

### Developer Documentation

**JSON Configuration Schema (v1.0)**:

```typescript
interface StudyConfig {
  version: "1.0";
  exported_at: string; // ISO datetime
  exported_by: string; // Email
  study: {
    slug: string;
    state: "draft";
    default_language: string;
    show_statement_codes: boolean;
    randomize_statement_order: boolean;
    symmetry_lock: boolean;
    grid_config: GridColumn[];
    presort_config: Record<string, any>;
    postsort_config: Record<string, any>;
    branding: {
      logo_url?: string;
      accent_color?: string;
      primary_color?: string;
      partners: PartnerLogo[];
    };
    translations: Translation[];
    statements: Statement[];
  };
}
```

**Version Migration Guide**:

When schema changes, provide migration:

```python
def migrate_config_v1_to_v2(config: dict) -> dict:
    """Migrate configuration from v1.0 to v2.0"""
    if config["version"] == "1.0":
        # Add new fields
        config["study"]["new_field"] = default_value
        # Rename fields
        config["study"]["renamed"] = config["study"].pop("old_name")
        config["version"] = "2.0"
    return config
```

---

## 🎓 Knowledge Transfer

### Code Walkthrough Checklist

- [ ] Explain export endpoint logic
- [ ] Explain validation rules
- [ ] Explain import transaction flow
- [ ] Demo frontend components
- [ ] Show error handling patterns
- [ ] Explain version compatibility approach

### Maintenance Guide

**Adding New Validation Rules**:

```python
# In validate_study_import()
if some_new_condition:
    errors.append("New validation error message")
```

**Updating Schema Version**:

1. Increment version in export endpoint
2. Add migration function
3. Update validation endpoint
4. Update documentation
5. Add tests for migration

---

## 🔄 Future Enhancements

### Phase 2 Features (Future)

1. **Partial Import**:
   - Import only statements
   - Import only grid configuration
   - Import only branding

2. **Import Preview**:
   - Show full diff before import
   - Preview study in demo mode
   - Highlight changes from existing template

3. **Import from URL**:
   - Import config from public URL
   - Community template library
   - Version control integration (GitHub)

4. **Batch Import**:
   - Import multiple studies at once
   - CSV-to-study conversion
   - Template marketplace

5. **Export Options**:
   - Export as study template (generic placeholders)
   - Export specific languages only
   - Export with/without branding

6. **Version Control**:
   - Track configuration changes over time
   - Restore previous versions
   - Compare versions visually

---

## 📞 Support & Rollback Plan

### Rollback Strategy

If critical issues arise:

1. **Backend**: Remove/disable new endpoints
2. **Frontend**: Hide import/export buttons via feature flag
3. **Database**: No schema changes, safe to rollback

### Monitoring

```python
# Add logging
import logging
logger = logging.getLogger(__name__)

@router.post("/import")
async def import_study_config(...):
    logger.info(f"Import attempt: user={current_user.email}, slug={request.new_slug}")
    try:
        # ... import logic
        logger.info(f"Import success: slug={new_study.slug}")
    except Exception as e:
        logger.error(f"Import failed: {str(e)}", exc_info=True)
        raise
```

### Support Escalation

- **Common errors**: User guide + tooltips
- **Validation errors**: Clear error messages
- **Edge cases**: Support ticket with config file attached
- **Bugs**: GitHub issue with reproduction steps

---

## ✅ Definition of Done

- [ ] All backend endpoints implemented and tested
- [ ] All frontend components implemented and styled
- [ ] Integration complete in study designer and list
- [ ] i18n translations added for EN, FR, FI
- [ ] Unit tests passing (>80% coverage)
- [ ] E2E tests passing
- [ ] Documentation complete
- [ ] Code reviewed and approved
- [ ] Deployed to staging and tested
- [ ] User acceptance testing passed
- [ ] Deployed to production
- [ ] Monitoring in place
- [ ] No critical bugs in first week

---

## 📚 References

### Related Documentation
- Study Configuration Schema: `/docs/schema.md`
- API Endpoints: `/docs/api.md`
- Design System: `/docs/design-system.md`

### External Resources
- [React Dropzone Docs](https://react-dropzone.js.org/)
- [Zod Validation](https://zod.dev/)
- [FastAPI File Upload](https://fastapi.tiangolo.com/tutorial/request-files/)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-17
**Author**: Senior UX Expert & React Frontend Developer
**Status**: Ready for Implementation
