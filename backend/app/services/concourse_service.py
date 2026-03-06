"""Service layer for Concourse operations."""

import logging
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..exceptions import ConflictError, NotFoundError, ValidationError
from ..models import (
    Concourse,
    ConcourseItem,
    ConcourseItemStatus,
    ConcourseItemTag,
    ConcourseItemTranslation,
    ConcourseTag,
    Statement,
    StatementTranslation,
    Study,
    StudyState,
)
from ..schemas.concourses import (
    ConcourseCreate,
    ConcourseImportToStudy,
    ConcourseItemBulkCreate,
    ConcourseItemBulkImport,
    ConcourseItemCreate,
    ConcourseItemUpdate,
    ConcourseTagCreate,
    ConcourseUpdate,
)

logger = logging.getLogger(__name__)


class ConcourseService:
    """Concourse CRUD and item management."""

    # ------------------------------------------------------------------
    # Concourse CRUD
    # ------------------------------------------------------------------

    @staticmethod
    async def create_concourse(
        db: AsyncSession,
        workspace_id: int,
        data: ConcourseCreate,
        user_id: int,
    ) -> Concourse:
        concourse = Concourse(
            workspace_id=workspace_id,
            title=data.title,
            description=data.description,
            created_by=user_id,
        )
        db.add(concourse)
        await db.flush()
        await db.commit()
        await db.refresh(concourse)
        return concourse

    @staticmethod
    async def list_concourses(
        db: AsyncSession,
        workspace_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Concourse], int]:
        """Return concourses with item counts."""
        base = select(Concourse).where(Concourse.workspace_id == workspace_id)

        count_result = await db.execute(
            select(func.count()).select_from(base.subquery())
        )
        total = count_result.scalar() or 0

        query = base.order_by(Concourse.created_at.desc()).limit(limit).offset(offset)
        result = await db.execute(query)
        concourses = list(result.scalars().all())

        # Attach item counts
        if concourses:
            ids = [c.id for c in concourses]
            count_q = (
                select(ConcourseItem.concourse_id, func.count(ConcourseItem.id))
                .where(ConcourseItem.concourse_id.in_(ids))
                .group_by(ConcourseItem.concourse_id)
            )
            count_result = await db.execute(count_q)
            counts: dict[int, int] = dict(count_result.all())  # type: ignore[arg-type]
            for c in concourses:
                c.item_count = counts.get(c.id, 0)  # type: ignore[attr-defined]

        return concourses, total

    @staticmethod
    async def get_concourse(db: AsyncSession, concourse_id: int) -> Concourse:
        stmt = (
            select(Concourse)
            .where(Concourse.id == concourse_id)
            .options(
                selectinload(Concourse.items).selectinload(ConcourseItem.translations),
                selectinload(Concourse.items).selectinload(ConcourseItem.tags),
            )
        )
        result = await db.execute(stmt)
        concourse = result.scalar_one_or_none()
        if concourse is None:
            raise NotFoundError("Concourse")
        return concourse

    @staticmethod
    async def update_concourse(
        db: AsyncSession, concourse_id: int, data: ConcourseUpdate
    ) -> Concourse:
        concourse = await db.get(Concourse, concourse_id)
        if concourse is None:
            raise NotFoundError("Concourse")

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(concourse, key, value)

        await db.commit()
        await db.refresh(concourse)
        return concourse

    @staticmethod
    async def delete_concourse(db: AsyncSession, concourse_id: int) -> None:
        concourse = await db.get(Concourse, concourse_id)
        if concourse is None:
            raise NotFoundError("Concourse")
        await db.delete(concourse)
        await db.commit()

    # ------------------------------------------------------------------
    # Item CRUD
    # ------------------------------------------------------------------

    @staticmethod
    async def _next_display_order(db: AsyncSession, concourse_id: int) -> int:
        result = await db.execute(
            select(func.coalesce(func.max(ConcourseItem.display_order), -1)).where(
                ConcourseItem.concourse_id == concourse_id
            )
        )
        return (result.scalar() or 0) + 1

    @staticmethod
    async def _attach_tags(db: AsyncSession, item_id: int, tag_ids: list[int]) -> None:
        await db.execute(
            delete(ConcourseItemTag).where(ConcourseItemTag.item_id == item_id)
        )
        for tag_id in tag_ids:
            db.add(ConcourseItemTag(item_id=item_id, tag_id=tag_id))

    @staticmethod
    async def create_item(
        db: AsyncSession,
        concourse_id: int,
        data: ConcourseItemCreate,
        user_id: int,
    ) -> ConcourseItem:
        display_order = await ConcourseService._next_display_order(db, concourse_id)

        item = ConcourseItem(
            concourse_id=concourse_id,
            code=data.code,
            status=data.status,
            source=data.source,
            display_order=display_order,
            created_by=user_id,
        )
        db.add(item)
        await db.flush()

        for t in data.translations:
            db.add(
                ConcourseItemTranslation(
                    item_id=item.id,
                    language_code=t.language_code,
                    text=t.text,
                )
            )

        if data.tag_ids:
            await ConcourseService._attach_tags(db, item.id, data.tag_ids)

        await db.commit()
        return await ConcourseService._load_item(db, item.id)

    @staticmethod
    async def bulk_create_items(
        db: AsyncSession,
        concourse_id: int,
        data: ConcourseItemBulkCreate,
        user_id: int,
    ) -> list[ConcourseItem]:
        display_order = await ConcourseService._next_display_order(db, concourse_id)
        created_ids: list[int] = []

        for i, item_data in enumerate(data.items):
            item = ConcourseItem(
                concourse_id=concourse_id,
                code=item_data.code,
                status=item_data.status,
                source=item_data.source,
                display_order=display_order + i,
                created_by=user_id,
            )
            db.add(item)
            await db.flush()

            for t in item_data.translations:
                db.add(
                    ConcourseItemTranslation(
                        item_id=item.id,
                        language_code=t.language_code,
                        text=t.text,
                    )
                )

            if item_data.tag_ids:
                await ConcourseService._attach_tags(db, item.id, item_data.tag_ids)

            created_ids.append(item.id)

        await db.commit()

        stmt = (
            select(ConcourseItem)
            .where(ConcourseItem.id.in_(created_ids))
            .options(
                selectinload(ConcourseItem.translations),
                selectinload(ConcourseItem.tags),
            )
            .order_by(ConcourseItem.display_order)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def bulk_import_text(
        db: AsyncSession,
        concourse_id: int,
        data: ConcourseItemBulkImport,
        user_id: int,
    ) -> list[ConcourseItem]:
        """Parse a text block (one statement per line) into items."""
        lines = [line.strip() for line in data.text_block.splitlines() if line.strip()]
        if not lines:
            return []

        display_order = await ConcourseService._next_display_order(db, concourse_id)
        created_ids: list[int] = []

        for i, line in enumerate(lines):
            code = f"{data.code_prefix}{display_order + i + 1}"
            item = ConcourseItem(
                concourse_id=concourse_id,
                code=code,
                status=ConcourseItemStatus.proposed,
                display_order=display_order + i,
                created_by=user_id,
            )
            db.add(item)
            await db.flush()

            db.add(
                ConcourseItemTranslation(
                    item_id=item.id,
                    language_code=data.language_code,
                    text=line,
                )
            )
            created_ids.append(item.id)

        await db.commit()

        stmt = (
            select(ConcourseItem)
            .where(ConcourseItem.id.in_(created_ids))
            .options(
                selectinload(ConcourseItem.translations),
                selectinload(ConcourseItem.tags),
            )
            .order_by(ConcourseItem.display_order)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update_item(
        db: AsyncSession, item_id: int, data: ConcourseItemUpdate
    ) -> ConcourseItem:
        """Update an item with optimistic locking."""
        update_values: dict = {}
        if data.code is not None:
            update_values["code"] = data.code
        if data.source is not None:
            update_values["source"] = data.source
        if data.status is not None:
            update_values["status"] = data.status

        # Always bump version
        update_values["version"] = data.version + 1

        result = await db.execute(
            update(ConcourseItem)
            .where(ConcourseItem.id == item_id, ConcourseItem.version == data.version)
            .values(**update_values)
        )

        if result.rowcount == 0:  # type: ignore[attr-defined]
            existing = await db.get(ConcourseItem, item_id)
            if existing is None:
                raise NotFoundError("ConcourseItem")
            raise ConflictError("Item was modified by another user. Refresh and retry.")

        # Update translations if provided
        if data.translations is not None:
            await db.execute(
                delete(ConcourseItemTranslation).where(
                    ConcourseItemTranslation.item_id == item_id
                )
            )
            for t in data.translations:
                db.add(
                    ConcourseItemTranslation(
                        item_id=item_id,
                        language_code=t.language_code,
                        text=t.text,
                    )
                )

        # Update tags if provided
        if data.tag_ids is not None:
            await ConcourseService._attach_tags(db, item_id, data.tag_ids)

        await db.commit()
        return await ConcourseService._load_item(db, item_id)

    @staticmethod
    async def delete_item(db: AsyncSession, item_id: int) -> None:
        item = await db.get(ConcourseItem, item_id)
        if item is None:
            raise NotFoundError("ConcourseItem")
        await db.delete(item)
        await db.commit()

    @staticmethod
    async def _load_item(db: AsyncSession, item_id: int) -> ConcourseItem:
        stmt = (
            select(ConcourseItem)
            .where(ConcourseItem.id == item_id)
            .options(
                selectinload(ConcourseItem.translations),
                selectinload(ConcourseItem.tags),
            )
        )
        result = await db.execute(stmt)
        item = result.scalar_one_or_none()
        if item is None:
            raise NotFoundError("ConcourseItem")
        return item

    # ------------------------------------------------------------------
    # Tags
    # ------------------------------------------------------------------

    @staticmethod
    async def list_tags(db: AsyncSession, workspace_id: int) -> list[ConcourseTag]:
        result = await db.execute(
            select(ConcourseTag)
            .where(ConcourseTag.workspace_id == workspace_id)
            .order_by(ConcourseTag.name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_tag(
        db: AsyncSession, workspace_id: int, data: ConcourseTagCreate
    ) -> ConcourseTag:
        tag = ConcourseTag(
            workspace_id=workspace_id,
            name=data.name,
            color=data.color,
        )
        db.add(tag)
        await db.commit()
        await db.refresh(tag)
        return tag

    @staticmethod
    async def delete_tag(db: AsyncSession, tag_id: int) -> None:
        tag = await db.get(ConcourseTag, tag_id)
        if tag is None:
            raise NotFoundError("ConcourseTag")
        await db.delete(tag)
        await db.commit()

    # ------------------------------------------------------------------
    # Import into Study
    # ------------------------------------------------------------------

    @staticmethod
    async def import_to_study(
        db: AsyncSession,
        study: Study,
        data: ConcourseImportToStudy,
    ) -> Study:
        """Copy concourse items into a study as statements.

        Items are copied (no FK reference back). The study must be in draft state.
        """
        if study.state != StudyState.draft:
            raise ValidationError("Cannot import into a non-draft study.")

        # Load concourse and validate ownership
        concourse = await db.get(Concourse, data.concourse_id)
        if concourse is None:
            raise NotFoundError("Concourse")
        if concourse.workspace_id != study.workspace_id:
            raise ValidationError(
                "Concourse must belong to the same workspace as the study."
            )

        # Load requested items with translations
        stmt = (
            select(ConcourseItem)
            .where(
                ConcourseItem.id.in_(data.item_ids),
                ConcourseItem.concourse_id == data.concourse_id,
            )
            .options(selectinload(ConcourseItem.translations))
            .order_by(ConcourseItem.display_order)
        )
        result = await db.execute(stmt)
        items = list(result.scalars().all())

        if len(items) != len(data.item_ids):
            found_ids = {i.id for i in items}
            missing = [i for i in data.item_ids if i not in found_ids]
            raise ValidationError(f"Items not found in concourse: {missing}")

        # Optionally clear existing statements
        if data.replace_existing:
            from sqlalchemy import delete as sa_delete

            await db.execute(sa_delete(Statement).where(Statement.study_id == study.id))
            start_order = 0
        else:
            # Find the next display_order
            max_order_result = await db.execute(
                select(func.coalesce(func.max(Statement.display_order), -1)).where(
                    Statement.study_id == study.id
                )
            )
            start_order = (max_order_result.scalar() or 0) + 1

        # Copy items as statements (with traceability link)
        now = datetime.utcnow()
        for i, item in enumerate(items):
            code = f"{data.code_prefix}{item.code}" if data.code_prefix else item.code
            new_stmt = Statement(
                study_id=study.id,
                code=code,
                display_order=start_order + i,
                source_concourse_item_id=item.id,
                source_imported_at=now,
            )
            db.add(new_stmt)
            await db.flush()

            for trans in item.translations:
                db.add(
                    StatementTranslation(
                        statement_id=new_stmt.id,
                        language_code=trans.language_code,
                        text=trans.text,
                    )
                )

        await db.commit()

        # Return refreshed study
        from sqlalchemy.orm import selectinload as sil

        fresh = await db.execute(
            select(Study)
            .where(Study.id == study.id)
            .options(
                sil(Study.translations),
                sil(Study.statements).selectinload(Statement.translations),
                sil(Study.participants),
            )
        )
        return fresh.scalar_one()

    # ------------------------------------------------------------------
    # Concourse → Study: staleness check & sync
    # ------------------------------------------------------------------

    @staticmethod
    async def check_stale_statements(
        db: AsyncSession,
        study: Study,
    ) -> list[dict]:  # Returns StaleStatementRead-compatible dicts
        """Return statements whose concourse source has been updated since import.

        Each entry contains the statement id, the concourse item id,
        and the current vs imported translations for diff display.
        """
        # Find linked statements
        stmt = (
            select(Statement)
            .where(
                Statement.study_id == study.id,
                Statement.source_concourse_item_id.isnot(None),
            )
            .options(selectinload(Statement.translations))
        )
        result = await db.execute(stmt)
        linked_statements = list(result.scalars().all())

        if not linked_statements:
            return []

        # Load their source concourse items
        source_ids = [s.source_concourse_item_id for s in linked_statements]
        item_stmt = (
            select(ConcourseItem)
            .where(ConcourseItem.id.in_(source_ids))
            .options(selectinload(ConcourseItem.translations))
        )
        item_result = await db.execute(item_stmt)
        items_by_id = {item.id: item for item in item_result.scalars().all()}

        stale = []
        for s in linked_statements:
            source_id = s.source_concourse_item_id
            assert source_id is not None  # guaranteed by query filter
            item = items_by_id.get(source_id)
            if item is None:
                # Source was deleted
                stale.append(
                    {
                        "statement_id": s.id,
                        "statement_code": s.code,
                        "source_concourse_item_id": source_id,
                        "source_deleted": True,
                        "current_translations": [
                            {"language_code": t.language_code, "text": t.text}
                            for t in s.translations
                        ],
                        "concourse_translations": [],
                    }
                )
                continue

            if s.source_imported_at and item.updated_at > s.source_imported_at:
                stale.append(
                    {
                        "statement_id": s.id,
                        "statement_code": s.code,
                        "source_concourse_item_id": item.id,
                        "source_deleted": False,
                        "current_translations": [
                            {"language_code": t.language_code, "text": t.text}
                            for t in s.translations
                        ],
                        "concourse_translations": [
                            {"language_code": t.language_code, "text": t.text}
                            for t in item.translations
                        ],
                    }
                )

        return stale

    @staticmethod
    async def sync_statement_from_concourse(
        db: AsyncSession,
        study: Study,
        statement_id: int,
    ) -> Statement:
        """Update a single statement's translations from its concourse source."""
        if study.state != StudyState.draft:
            raise ValidationError("Cannot sync statements in a non-draft study.")

        stmt_q = (
            select(Statement)
            .where(Statement.id == statement_id, Statement.study_id == study.id)
            .options(selectinload(Statement.translations))
        )
        result = await db.execute(stmt_q)
        statement = result.scalar_one_or_none()
        if statement is None:
            raise NotFoundError("Statement")
        if statement.source_concourse_item_id is None:
            raise ValidationError("Statement is not linked to a concourse item.")

        # Load source item
        item_q = (
            select(ConcourseItem)
            .where(ConcourseItem.id == statement.source_concourse_item_id)
            .options(selectinload(ConcourseItem.translations))
        )
        item_result = await db.execute(item_q)
        item = item_result.scalar_one_or_none()
        if item is None:
            raise NotFoundError("Source concourse item has been deleted.")

        # Replace translations
        await db.execute(
            delete(StatementTranslation).where(
                StatementTranslation.statement_id == statement.id
            )
        )
        for trans in item.translations:
            db.add(
                StatementTranslation(
                    statement_id=statement.id,
                    language_code=trans.language_code,
                    text=trans.text,
                )
            )

        # Update imported_at timestamp
        statement.source_imported_at = datetime.utcnow()
        await db.commit()

        # Reload
        reload_q = (
            select(Statement)
            .where(Statement.id == statement.id)
            .options(selectinload(Statement.translations))
        )
        reload_result = await db.execute(reload_q)
        return reload_result.scalar_one()
