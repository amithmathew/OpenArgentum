#!/usr/bin/env python3
"""Generate a realistic demo database for OpenArgentum.

Usage:
    python scripts/generate_demo.py

Creates demo/demo.db with ~4 months of transactions across multiple accounts.
"""

import hashlib
import json
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.database import SCHEMA_SQL, SEED_TIERS

DEMO_DB = PROJECT_ROOT / "demo" / "demo.db"

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

CATEGORIES = {
    # category_name: (tier_name, typical_descriptions)
    "Rent & Mortgage": ("Essential", []),
    "Utilities": ("Essential", ["Hydro One", "Enbridge Gas", "Bell Canada", "Rogers Internet"]),
    "Groceries": ("Essential", ["Loblaws", "Metro", "No Frills", "Farm Boy", "Costco", "Walmart Grocery", "T&T Supermarket"]),
    "Insurance": ("Essential", ["Manulife Insurance", "Sun Life Premium", "TD Insurance"]),
    "Medical & Health": ("Essential", ["Shoppers Drug Mart", "Rexall Pharmacy", "LifeLabs"]),
    "Transportation": ("Essential", ["Presto Transit", "Esso", "Shell", "Petro-Canada", "Uber", "Lyft"]),
    "Dining Out": ("Lifestyle", ["Starbucks", "Tim Hortons", "McDonald's", "Subway", "Swiss Chalet", "The Keg", "Boston Pizza", "Chipotle", "Pho Dau Bo", "Nando's"]),
    "Subscriptions": ("Lifestyle", ["Netflix", "Spotify", "Apple iCloud", "YouTube Premium", "Amazon Prime", "Adobe Creative Cloud"]),
    "Fitness & Wellness": ("Lifestyle", ["GoodLife Fitness", "Lululemon", "Running Room"]),
    "Personal Care": ("Lifestyle", ["Great Clips", "Sephora", "Bath & Body Works"]),
    "Clothing": ("Lifestyle", ["Uniqlo", "H&M", "Zara", "Mark's Work Wearhouse", "Winners"]),
    "Home & Garden": ("Lifestyle", ["Home Depot", "Canadian Tire", "IKEA", "Wayfair"]),
    "Entertainment": ("Discretionary", ["Cineplex", "Steam Games", "Nintendo eShop", "Ticketmaster", "Indigo Books"]),
    "Travel": ("Discretionary", ["Air Canada", "Airbnb", "Booking.com", "Marriott Hotels"]),
    "Electronics": ("Discretionary", ["Best Buy", "Apple Store", "Amazon Electronics", "Canada Computers"]),
    "Gifts & Donations": ("Discretionary", ["Amazon Gift", "Etsy", "GoFundMe", "United Way"]),
    "Education": ("Lifestyle", ["Udemy", "Coursera", "O'Reilly Media"]),
}

TAGS = [
    ("Recurring", "#3b82f6"),
    ("Impulse", "#ef4444"),
    ("Work-related", "#8b5cf6"),
    ("Family", "#ec4899"),
    ("Online", "#06b6d4"),
    ("In-store", "#10b981"),
]

ACCOUNTS = [
    {"name": "Main Checking", "institution": "TD Canada Trust", "account_type": "checking", "account_number": "****4521", "account_holder": "Alex Morgan"},
    {"name": "Visa Infinite", "institution": "TD Canada Trust", "account_type": "credit", "account_number": "****8834", "account_holder": "Alex Morgan"},
    {"name": "Savings", "institution": "EQ Bank", "account_type": "savings", "account_number": "****2290", "account_holder": "Alex Morgan"},
]

INCOME_SOURCES = [
    ("Employer Direct Deposit", 520000, "checking"),   # $5,200 biweekly
    ("Employer Direct Deposit", 520000, "checking"),
]

# Recurring monthly expenses (description, amount_cents, account_type, category)
RECURRING_MONTHLY = [
    ("Rent Payment", 195000, "checking", "Rent & Mortgage"),
    ("Hydro One", 8500, "checking", "Utilities"),
    ("Enbridge Gas", 6200, "checking", "Utilities"),
    ("Rogers Internet", 7999, "checking", "Utilities"),
    ("Bell Canada Mobile", 6500, "checking", "Utilities"),
    ("Manulife Insurance", 15000, "checking", "Insurance"),
    ("TD Insurance - Auto", 12500, "checking", "Insurance"),
    ("Netflix", 1699, "credit", "Subscriptions"),
    ("Spotify", 1099, "credit", "Subscriptions"),
    ("Apple iCloud", 399, "credit", "Subscriptions"),
    ("YouTube Premium", 1399, "credit", "Subscriptions"),
    ("GoodLife Fitness", 5499, "credit", "Fitness & Wellness"),
    ("Presto Transit Auto-Load", 15000, "checking", "Transportation"),
]

# Weight distribution for random transaction categories (for variable spending)
VARIABLE_CATEGORIES = [
    ("Groceries", 8),
    ("Dining Out", 6),
    ("Transportation", 3),
    ("Clothing", 2),
    ("Home & Garden", 2),
    ("Entertainment", 3),
    ("Personal Care", 1),
    ("Medical & Health", 1),
    ("Electronics", 1),
    ("Gifts & Donations", 1),
    ("Education", 1),
]

# Amount ranges by category (min_cents, max_cents)
AMOUNT_RANGES = {
    "Groceries": (2500, 18000),
    "Dining Out": (500, 8500),
    "Transportation": (1500, 7000),
    "Clothing": (2000, 15000),
    "Home & Garden": (1500, 25000),
    "Entertainment": (1000, 8000),
    "Personal Care": (1500, 6000),
    "Medical & Health": (1500, 12000),
    "Electronics": (3000, 80000),
    "Gifts & Donations": (2000, 10000),
    "Education": (1500, 5000),
    "Travel": (15000, 200000),
}


# ---------------------------------------------------------------------------
# Generation logic
# ---------------------------------------------------------------------------

def generate_transactions(start_date: date, end_date: date) -> list[dict]:
    """Generate a realistic set of transactions over the date range."""
    txns = []
    current = start_date

    # Pre-build weighted category list
    weighted_cats = []
    for cat, weight in VARIABLE_CATEGORIES:
        weighted_cats.extend([cat] * weight)

    while current <= end_date:
        month_start = current.replace(day=1)
        month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        if month_end > end_date:
            month_end = end_date

        # Income: biweekly on 1st and 15th
        for day in [1, 15]:
            pay_date = month_start.replace(day=min(day, month_end.day))
            if start_date <= pay_date <= end_date:
                txns.append({
                    "date": pay_date,
                    "description": "Employer Direct Deposit",
                    "description_raw": "EMPLOYER DIRECT DEP PAYROLL",
                    "amount_cents": 520000 + random.randint(-5000, 5000),
                    "transaction_type": "deposit",
                    "category": "Income",
                    "account_type": "checking",
                    "tags": ["Recurring"],
                })

        # Recurring monthly expenses (around the same date each month)
        for desc, amount, acct_type, cat in RECURRING_MONTHLY:
            day = random.randint(1, 5)
            txn_date = month_start.replace(day=min(day, month_end.day))
            if start_date <= txn_date <= end_date:
                variance = int(amount * 0.05)
                txns.append({
                    "date": txn_date,
                    "description": desc,
                    "description_raw": desc.upper().replace(" ", " ") + f" #{random.randint(1000,9999)}",
                    "amount_cents": -(amount + random.randint(-variance, variance)),
                    "transaction_type": "payment",
                    "category": cat,
                    "account_type": acct_type,
                    "tags": ["Recurring"],
                })

        # Variable spending: 20-35 transactions per month
        num_variable = random.randint(20, 35)
        for _ in range(num_variable):
            cat = random.choice(weighted_cats)
            descs = CATEGORIES[cat][1]
            if not descs:
                continue
            desc = random.choice(descs)
            lo, hi = AMOUNT_RANGES[cat]
            amount = random.randint(lo, hi)
            day = random.randint(1, month_end.day)
            txn_date = month_start.replace(day=day)
            if txn_date < start_date or txn_date > end_date:
                continue

            acct_type = random.choice(["credit", "credit", "credit", "checking"])  # 75% credit card
            txn_tags = []
            if random.random() < 0.15:
                txn_tags.append("Impulse")
            if random.random() < 0.1:
                txn_tags.append("Work-related")
            if random.random() < 0.2:
                txn_tags.append("Online" if random.random() < 0.5 else "In-store")
            if random.random() < 0.1:
                txn_tags.append("Family")

            txns.append({
                "date": txn_date,
                "description": desc,
                "description_raw": desc.upper() + f" #{random.randint(100000, 999999)}",
                "amount_cents": -amount,
                "transaction_type": "purchase",
                "category": cat,
                "account_type": acct_type,
                "tags": txn_tags,
            })

        # One-off travel expense (sometimes)
        if random.random() < 0.15:
            descs = CATEGORIES["Travel"][1]
            desc = random.choice(descs)
            lo, hi = AMOUNT_RANGES["Travel"]
            amount = random.randint(lo, hi)
            day = random.randint(1, month_end.day)
            txn_date = month_start.replace(day=day)
            if start_date <= txn_date <= end_date:
                txns.append({
                    "date": txn_date,
                    "description": desc,
                    "description_raw": desc.upper() + f" BOOKING #{random.randint(100000, 999999)}",
                    "amount_cents": -amount,
                    "transaction_type": "purchase",
                    "category": "Travel",
                    "account_type": "credit",
                    "tags": [],
                })

        # Savings transfer (monthly)
        transfer_day = random.randint(1, 5)
        txn_date = month_start.replace(day=min(transfer_day, month_end.day))
        if start_date <= txn_date <= end_date:
            amount = random.choice([50000, 75000, 100000])
            txns.append({
                "date": txn_date,
                "description": "Transfer to Savings",
                "description_raw": "ONLINE TFR TO SAV ****2290",
                "amount_cents": -amount,
                "transaction_type": "transfer",
                "category": None,
                "account_type": "checking",
                "is_transfer": True,
                "tags": [],
            })
            txns.append({
                "date": txn_date,
                "description": "Transfer from Checking",
                "description_raw": "ONLINE TFR FROM CHK ****4521",
                "amount_cents": amount,
                "transaction_type": "transfer",
                "category": None,
                "account_type": "savings",
                "is_transfer": True,
                "tags": [],
            })

        # Credit card payment (monthly)
        pay_day = random.randint(20, 25)
        txn_date = month_start.replace(day=min(pay_day, month_end.day))
        if start_date <= txn_date <= end_date:
            # Sum up credit card spending for this month (approximate)
            cc_total = sum(abs(t["amount_cents"]) for t in txns
                         if t["date"].month == month_start.month and t["date"].year == month_start.year
                         and t["account_type"] == "credit" and t["amount_cents"] < 0)
            if cc_total > 0:
                txns.append({
                    "date": txn_date,
                    "description": "Credit Card Payment",
                    "description_raw": "VISA PAYMENT THANK YOU",
                    "amount_cents": cc_total,
                    "transaction_type": "payment",
                    "category": None,
                    "account_type": "credit",
                    "is_transfer": True,
                    "tags": [],
                })
                txns.append({
                    "date": txn_date,
                    "description": "Credit Card Payment",
                    "description_raw": "PAYMENT TO TD VISA ****8834",
                    "amount_cents": -cc_total,
                    "transaction_type": "payment",
                    "category": None,
                    "account_type": "checking",
                    "is_transfer": True,
                    "tags": [],
                })

        # Advance to next month
        current = (month_start + timedelta(days=32)).replace(day=1)

    txns.sort(key=lambda t: t["date"])
    return txns


def fingerprint(txn: dict, account_id: int, occurrence: int = 0) -> str:
    """Generate transaction fingerprint matching the app's dedup logic."""
    raw = f"{txn['date'].isoformat()}|{txn['amount_cents']}|{txn['description'].lower()}|{account_id}|{occurrence}"
    return hashlib.sha256(raw.encode()).hexdigest()


def build_demo_db():
    """Build the complete demo database."""
    DEMO_DB.parent.mkdir(parents=True, exist_ok=True)
    if DEMO_DB.exists():
        DEMO_DB.unlink()

    conn = sqlite3.connect(str(DEMO_DB))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA_SQL)

    # Seed tiers
    tier_ids = {}
    for tier in SEED_TIERS:
        conn.execute(
            "INSERT INTO spend_tiers (name, description, color, sort_order) VALUES (?, ?, ?, ?)",
            (tier["name"], tier["description"], tier["color"], tier["sort_order"]),
        )
        tier_ids[tier["name"]] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()

    # Add "Income" as a special category (no tier)
    all_cats = list(CATEGORIES.keys()) + ["Income"]

    # Insert categories
    cat_ids = {}
    for cat_name in all_cats:
        if cat_name == "Income":
            tier_id = None
        else:
            tier_name = CATEGORIES[cat_name][0]
            tier_id = tier_ids[tier_name]
        conn.execute(
            "INSERT INTO categories (name, default_tier_id, is_confirmed) VALUES (?, ?, 1)",
            (cat_name, tier_id),
        )
        cat_ids[cat_name] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()

    # Insert tags
    tag_ids = {}
    for tag_name, tag_color in TAGS:
        conn.execute(
            "INSERT INTO tags (name, color, is_confirmed) VALUES (?, ?, 1)",
            (tag_name, tag_color),
        )
        tag_ids[tag_name] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()

    # Insert accounts
    account_ids = {}  # keyed by account_type
    for acct in ACCOUNTS:
        conn.execute(
            "INSERT INTO accounts (name, institution, account_type, account_number, account_holder) VALUES (?, ?, ?, ?, ?)",
            (acct["name"], acct["institution"], acct["account_type"], acct["account_number"], acct["account_holder"]),
        )
        account_ids[acct["account_type"]] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()

    # Generate transactions: ~4 months back from today
    end = date.today()
    start = (end - timedelta(days=120)).replace(day=1)
    txns = generate_transactions(start, end)

    print(f"Generated {len(txns)} transactions from {start} to {end}")

    # Insert transactions (no statements — demo has no PDFs)
    # We create a dummy statement per account/month for referential integrity
    stmt_ids = {}
    for txn in txns:
        acct_type = txn["account_type"]
        account_id = account_ids[acct_type]
        month_key = f"{acct_type}_{txn['date'].strftime('%Y-%m')}"

        if month_key not in stmt_ids:
            month_label = txn["date"].strftime("%B %Y")
            acct_name = next(a["name"] for a in ACCOUNTS if a["account_type"] == acct_type)
            filename = f"demo_{acct_type}_{txn['date'].strftime('%Y_%m')}.pdf"
            file_hash = hashlib.sha256(month_key.encode()).hexdigest()
            conn.execute(
                "INSERT INTO statements (filename, file_hash, account_id, statement_period_start, statement_period_end, status, transaction_count) VALUES (?, ?, ?, ?, ?, 'completed', 0)",
                (filename, file_hash, account_id, txn["date"].replace(day=1).isoformat(),
                 ((txn["date"].replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)).isoformat()),
            )
            stmt_ids[month_key] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        stmt_id = stmt_ids[month_key]
        cat_name = txn.get("category")
        cat_id = cat_ids.get(cat_name) if cat_name else None
        tier_id = None
        if cat_id and cat_name and cat_name in CATEGORIES:
            tier_name = CATEGORIES[cat_name][0]
            tier_id = tier_ids.get(tier_name)

        is_transfer = 1 if txn.get("is_transfer") else 0
        fp = fingerprint(txn, account_id)

        conn.execute(
            """INSERT INTO transactions
            (statement_id, account_id, date, description, description_raw, amount_cents,
             transaction_type, fingerprint, is_transfer, category_id, tier_id, categorization_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (stmt_id, account_id, txn["date"].isoformat(), txn["description"],
             txn["description_raw"], txn["amount_cents"], txn["transaction_type"],
             fp, is_transfer, cat_id, tier_id, "auto" if cat_id else "pending"),
        )
        txn_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Assign tags
        for tag_name in txn.get("tags", []):
            if tag_name in tag_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
                    (txn_id, tag_ids[tag_name]),
                )

    # Update statement transaction counts
    for month_key, stmt_id in stmt_ids.items():
        count = conn.execute("SELECT COUNT(*) FROM transactions WHERE statement_id = ?", (stmt_id,)).fetchone()[0]
        conn.execute("UPDATE statements SET transaction_count = ?, processed_at = datetime('now') WHERE id = ?", (count, stmt_id))

    conn.commit()

    # Create projects
    # "Home Renovation" project with some Home & Garden + Electronics txns
    conn.execute(
        """INSERT INTO projects (name, description, color, budget_target_cents, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?)""",
        ("Home Renovation", "Kitchen and bathroom refresh", "#f59e0b", 300000,
         start.isoformat(), None),
    )
    reno_project_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Assign some Home & Garden and Electronics transactions to the project
    reno_txns = conn.execute(
        "SELECT id FROM transactions WHERE category_id IN (?, ?) AND amount_cents < 0 ORDER BY RANDOM() LIMIT 8",
        (cat_ids.get("Home & Garden"), cat_ids.get("Electronics")),
    ).fetchall()
    for row in reno_txns:
        conn.execute("INSERT OR IGNORE INTO transaction_projects (transaction_id, project_id) VALUES (?, ?)", (row[0], reno_project_id))

    # "Vacation Fund" project
    conn.execute(
        """INSERT INTO projects (name, description, color, budget_target_cents, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?)""",
        ("Summer Vacation", "Trip to BC coast", "#3b82f6", 500000,
         start.isoformat(), (end + timedelta(days=60)).isoformat()),
    )
    vacation_project_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    travel_txns = conn.execute(
        "SELECT id FROM transactions WHERE category_id = ? AND amount_cents < 0",
        (cat_ids.get("Travel"),),
    ).fetchall()
    for row in travel_txns:
        conn.execute("INSERT OR IGNORE INTO transaction_projects (transaction_id, project_id) VALUES (?, ?)", (row[0], vacation_project_id))

    conn.commit()

    # Create a sample chat session
    conn.execute("INSERT INTO chat_sessions (title) VALUES (?)", ("Spending overview",))
    session_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    conn.execute(
        "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)",
        (session_id, "What were my top spending categories last month?"),
    )
    conn.execute(
        "INSERT INTO chat_messages (session_id, role, content, metadata) VALUES (?, 'assistant', ?, ?)",
        (session_id,
         "Here's a breakdown of your top spending categories for last month:\n\n"
         "1. **Rent & Mortgage** -- $1,950\n"
         "2. **Groceries** -- ~$680\n"
         "3. **Dining Out** -- ~$320\n"
         "4. **Subscriptions** -- ~$250\n"
         "5. **Transportation** -- ~$220\n\n"
         "Your essential spending (rent, utilities, insurance, groceries) makes up about 65% of your total expenses. "
         "Would you like me to show a chart or dig deeper into any category?",
         json.dumps({"tools_used": ["aggregate_spending", "generate_chart"]})),
    )
    conn.commit()

    # Final stats
    total = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    cats = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
    tags_count = conn.execute("SELECT COUNT(*) FROM tags").fetchone()[0]
    size_bytes = DEMO_DB.stat().st_size

    # Checkpoint WAL to make the file self-contained
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()

    # Delete WAL/SHM files for clean distribution
    for suffix in ("-wal", "-shm"):
        f = Path(str(DEMO_DB) + suffix)
        if f.exists():
            f.unlink()

    print(f"\nDemo database created at: {DEMO_DB}")
    print(f"  Transactions: {total}")
    print(f"  Categories:   {cats}")
    print(f"  Tags:         {tags_count}")
    print(f"  Accounts:     {len(ACCOUNTS)}")
    print(f"  Projects:     2")
    print(f"  Size:         {size_bytes / 1024:.1f} KB")


if __name__ == "__main__":
    random.seed(42)  # Reproducible output
    build_demo_db()
