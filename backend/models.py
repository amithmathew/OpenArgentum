from pydantic import BaseModel
from typing import Optional


# --- Spend Tiers ---
class TierCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#6b7280"
    sort_order: int = 0

class TierUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None

class TierResponse(BaseModel):
    id: int
    name: str
    description: str
    color: str
    sort_order: int
    created_at: str
    updated_at: str


# --- Categories ---
class CategoryCreate(BaseModel):
    name: str
    default_tier_id: Optional[int] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    default_tier_id: Optional[int] = None

class CategoryResponse(BaseModel):
    id: int
    name: str
    default_tier_id: Optional[int]
    is_confirmed: bool
    transaction_count: int = 0
    created_at: str


# --- Accounts ---
class AccountCreate(BaseModel):
    name: str
    institution: str = ""
    account_type: str = "checking"
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    icon_url: Optional[str] = None

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    institution: Optional[str] = None
    account_type: Optional[str] = None
    account_number: Optional[str] = None
    account_holder: Optional[str] = None
    icon_url: Optional[str] = None

class AccountResponse(BaseModel):
    id: int
    name: str
    institution: str
    account_type: str
    account_number: Optional[str]
    account_holder: Optional[str]
    icon_url: Optional[str]
    statement_count: int = 0
    transaction_count: int = 0
    created_at: str


# --- Statements ---
class StatementResponse(BaseModel):
    id: int
    filename: str
    file_hash: str
    account_id: Optional[int]
    statement_period_start: Optional[str]
    statement_period_end: Optional[str]
    status: str
    error_message: Optional[str]
    page_count: Optional[int]
    transaction_count: int
    uploaded_at: str
    processed_at: Optional[str]


# --- Transactions ---
class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    tier_id: Optional[int] = None
    is_transfer: Optional[bool] = None
    needs_review: Optional[bool] = None

class BulkTransactionUpdate(BaseModel):
    transaction_ids: list[int]
    category_id: Optional[int] = None
    tier_id: Optional[int] = None
    is_transfer: Optional[bool] = None
    needs_review: Optional[bool] = None

class TransactionResponse(BaseModel):
    id: int
    statement_id: int
    account_id: Optional[int]
    date: str
    description: str
    description_raw: Optional[str]
    amount_cents: int
    transaction_type: str
    balance_cents: Optional[int]
    reference: Optional[str]
    raw_text: Optional[str]
    fingerprint: Optional[str]
    is_transfer: bool
    needs_review: bool
    category_id: Optional[int]
    tier_id: Optional[int]
    categorization_status: str
    created_at: str
    updated_at: str


# --- Projects ---
class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#3b82f6"
    budget_target_cents: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    budget_target_cents: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_archived: Optional[bool] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    color: str
    budget_target_cents: Optional[int]
    start_date: Optional[str]
    end_date: Optional[str]
    is_archived: bool
    total_spent_cents: int = 0
    transaction_count: int = 0
    created_at: str
    updated_at: str

class AssignProjectRequest(BaseModel):
    transaction_ids: list[int]
    project_id: int

class UnassignProjectRequest(BaseModel):
    transaction_ids: list[int]
    project_id: int


# --- Tags ---
class TagCreate(BaseModel):
    name: str
    color: str = "#9ca3af"

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class TagResponse(BaseModel):
    id: int
    name: str
    color: str
    is_confirmed: int
    transaction_count: int = 0
    created_at: str
    updated_at: str

class AssignTagRequest(BaseModel):
    transaction_ids: list[int]
    tag_id: int

class UnassignTagRequest(BaseModel):
    transaction_ids: list[int]
    tag_id: int


# --- Generic list response ---
class ListResponse(BaseModel):
    items: list
    total: int
