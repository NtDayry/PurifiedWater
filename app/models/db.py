from typing import Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import UploadFile, File, Form


# =========================================================
# Auth Schemas
# =========================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    fullname: str
    username: str
    password: str
    department: str | None = None


class TokenResponse(BaseModel):
    id: int | None = None
    fullname: str | None = None
    profile_image: str | None = None
    role: str
    username: str
    permissions: list[str] = []


# =========================================================
# User Schemas
# =========================================================

class UserCreate(BaseModel):
    fullname: str
    username: str
    password: str
    department: str | None = None
    profile_image: str | None = None
    role: str | None = "viewer"
    status: str | None = "pending"


class UserResponse(BaseModel):
    id: int
    username: str
    fullname: str
    role: str
    status: str
    department: str | None = None
    profile_image: str | None = None
    registered_date: datetime
    last_sign_in_attempt: datetime | None = None
    sign_in_attempts: int | None = None

    model_config = {"from_attributes": True}


class UserUpdate:
    """Dependency for multipart/form-data user update."""
    def __init__(
        self,
        fullname: Optional[str] = Form(None),
        username: Optional[str] = Form(None),
        department: Optional[str] = Form(None),
        password: Optional[str] = Form(None),
        role: Optional[str] = Form(None),
        status: Optional[str] = Form(None),
        sign_in_attempts: Optional[int] = Form(None),
        profile_image: UploadFile | None = File(None),
    ):
        self.fullname = fullname
        self.username = username
        self.department = department
        self.password = password
        self.role = role
        self.status = status
        self.sign_in_attempts = sign_in_attempts
        self.profile_image = profile_image


class MyProfileUpdate(UserUpdate):
    """Dependency for multipart/form-data profile update."""
    def __init__(
        self,
        username: Optional[str] = Form(None),
        fullname: Optional[str] = Form(None),
        department: Optional[str] = Form(None),
        password: Optional[str] = Form(None),
        current_password: Optional[str] = Form(None),
        new_password: Optional[str] = Form(None),
        profile_image: UploadFile | None = File(None),
    ):
        self.username = username
        self.fullname = fullname
        self.department = department
        self.password = password
        self.current_password = current_password
        self.new_password = new_password
        self.profile_image = profile_image