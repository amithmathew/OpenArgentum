from fastapi import APIRouter, Query
from typing import Optional
from backend.database import get_db

router = APIRouter()


@router.get("/accounts")
def dashboard_accounts():
    """Each account with the latest transaction date processed for it (data-freshness view)."""
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT a.id, a.name, a.institution, a.account_type, a.icon_url,
                   MAX(t.date) AS last_transaction_date,
                   COUNT(t.id) AS transaction_count
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id AND t.is_hidden = 0
            GROUP BY a.id
            ORDER BY a.name COLLATE NOCASE
            """
        ).fetchall()
        return {"items": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/monthly-summary")
def monthly_summary(months: int = 12):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT
                strftime('%Y-%m', t.date) as month,
                SUM(CASE WHEN t.is_transfer = 0 THEN
                    CASE WHEN t.amount_cents < 0 THEN t.amount_cents ELSE 0 END
                END) as total_spend,
                SUM(CASE WHEN t.is_transfer = 0 THEN
                    CASE WHEN t.amount_cents > 0 THEN t.amount_cents ELSE 0 END
                END) as total_income,
                COUNT(CASE WHEN t.is_transfer = 0 THEN 1 END) as transaction_count,
                SUM(CASE WHEN t.is_transfer = 0 THEN t.amount_cents ELSE 0 END) as net
            FROM transactions t
            WHERE t.is_hidden = 0
            GROUP BY month
            ORDER BY month DESC
            LIMIT ?
        """, (months,)).fetchall()

        # Also get per-tier breakdown per month
        tier_rows = conn.execute("""
            SELECT
                strftime('%Y-%m', t.date) as month,
                COALESCE(st.name, 'Uncategorized') as tier_name,
                COALESCE(st.color, '#9ca3af') as tier_color,
                SUM(t.amount_cents) as total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
            WHERE t.is_hidden = 0 AND t.is_transfer = 0
            AND t.amount_cents < 0
            GROUP BY month, tier_name
            ORDER BY month DESC
        """).fetchall()

        # Organize tier data by month
        tier_by_month = {}
        for r in tier_rows:
            m = r["month"]
            if m not in tier_by_month:
                tier_by_month[m] = []
            tier_by_month[m].append({
                "tier": r["tier_name"],
                "color": r["tier_color"],
                "total": r["total"],
            })

        return {
            "months": [
                {
                    "month": r["month"],
                    "total_spend": r["total_spend"] or 0,
                    "total_income": r["total_income"] or 0,
                    "net": r["net"] or 0,
                    "transaction_count": r["transaction_count"] or 0,
                    "by_tier": tier_by_month.get(r["month"], []),
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@router.get("/category-breakdown")
def category_breakdown(date_from: Optional[str] = None, date_to: Optional[str] = None):
    conn = get_db()
    try:
        conditions = ["t.is_hidden = 0", "t.is_transfer = 0", "t.amount_cents < 0"]
        params = []
        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)

        where = " AND ".join(conditions)

        rows = conn.execute(f"""
            SELECT
                COALESCE(c.name, 'Uncategorized') as category,
                COALESCE(st.name, 'Uncategorized') as tier,
                COALESCE(st.color, '#9ca3af') as color,
                SUM(t.amount_cents) as total,
                COUNT(*) as count
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
            WHERE {where}
            GROUP BY category
            ORDER BY total ASC
        """, params).fetchall()

        return {"items": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/tier-breakdown")
def tier_breakdown(date_from: Optional[str] = None, date_to: Optional[str] = None):
    conn = get_db()
    try:
        conditions = ["t.is_hidden = 0", "t.is_transfer = 0", "t.amount_cents < 0"]
        params = []
        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)

        where = " AND ".join(conditions)

        rows = conn.execute(f"""
            SELECT
                COALESCE(st.name, 'Uncategorized') as tier,
                COALESCE(st.color, '#9ca3af') as color,
                SUM(t.amount_cents) as total,
                COUNT(*) as count
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
            WHERE {where}
            GROUP BY tier
            ORDER BY total ASC
        """, params).fetchall()

        return {"items": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/tag-breakdown")
def tag_breakdown(date_from: Optional[str] = None, date_to: Optional[str] = None, category_id: Optional[int] = None):
    """Tag breakdown, optionally filtered by category for drill-down."""
    conn = get_db()
    try:
        conditions = ["t.is_hidden = 0", "t.is_transfer = 0", "t.amount_cents < 0"]
        params = []
        if date_from:
            conditions.append("t.date >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("t.date <= ?")
            params.append(date_to)
        if category_id is not None:
            conditions.append("t.category_id = ?")
            params.append(category_id)

        where = " AND ".join(conditions)

        rows = conn.execute(f"""
            SELECT
                tg.name as tag,
                tg.color as color,
                SUM(t.amount_cents) as total,
                COUNT(*) as count
            FROM transactions t
            JOIN transaction_tags tt ON t.id = tt.transaction_id
            JOIN tags tg ON tt.tag_id = tg.id
            WHERE {where}
            GROUP BY tg.id
            ORDER BY total ASC
        """, params).fetchall()

        return {"items": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/trends")
def trends(months: int = 12):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT
                strftime('%Y-%m', t.date) as month,
                COALESCE(st.name, 'Uncategorized') as tier,
                COALESCE(st.color, '#9ca3af') as color,
                SUM(t.amount_cents) as total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            LEFT JOIN spend_tiers st ON COALESCE(t.tier_id, c.default_tier_id) = st.id
            WHERE t.is_hidden = 0 AND t.is_transfer = 0
            AND t.amount_cents < 0
            GROUP BY month, tier
            ORDER BY month ASC
            LIMIT ?
        """, (months * 10,)).fetchall()

        return {"items": [dict(r) for r in rows]}
    finally:
        conn.close()
