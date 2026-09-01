from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import User
from backend.auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/users")
def get_all_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "scan_count": u.scan_count,
            "created_at": str(u.created_at),
            "last_login": str(u.last_login) if u.last_login else "Never",
        }
        for u in users
    ]

@router.get("/stats")
def get_platform_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_users = db.query(User).count()
    total_scans = db.query(User).with_entities(User.scan_count).all()
    total_scan_count = sum(s[0] for s in total_scans)
    admin_count = db.query(User).filter(User.role.in_(["admin", "superadmin"])).count()
    return {
        "total_users": total_users,
        "total_scans": total_scan_count,
        "admin_count": admin_count,
    }

@router.post("/users/{user_id}/role")
def update_user_role(user_id: int, role: str, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    if role not in ("user", "admin", "superadmin"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid role")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    user.role = role
    db.commit()
    return {"status": "success", "user_id": user_id, "new_role": role}

@router.delete("/users/{user_id}")
def deactivate_user(user_id: int, db: Session = Depends(get_db), current: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user.is_active = False
    db.commit()
    return {"status": "deactivated", "user_id": user_id}
